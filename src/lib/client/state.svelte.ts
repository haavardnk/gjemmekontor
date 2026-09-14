import type { IDBPDatabase } from 'idb';
import { SvelteURLSearchParams } from 'svelte/reactivity';
import { z } from 'zod';

import { connectivity } from './connectivity.svelte';
import {
	getClientId,
	type GjemmekontorDatabase,
	type JsonValue,
	openClientDatabase,
	tripClientDatabaseName
} from './database';
import { startSyncTriggers } from './sync-triggers';

const syncResponseSchema = z.object({
	revision: z.number().int().nonnegative(),
	acknowledgedMutationIds: z.array(z.string())
});

const stateResponseSchema = z.object({
	revision: z.number().int().nonnegative(),
	entries: z.array(
		z.object({
			key: z.string(),
			value: z.json(),
			revision: z.number().int().positive(),
			clientId: z.string(),
			mutationId: z.string(),
			updatedAt: z.string()
		})
	)
});

export type SyncPhase = 'idle' | 'saving' | 'synced' | 'offline' | 'error';

export type SyncStatus = {
	phase: SyncPhase;
	pending: number;
};

type SharedStateOptions = {
	tripId?: string;
	databaseName?: string;
	fetcher?: typeof fetch;
	now?: () => number;
	randomId?: () => string;
};

export type SharedStateWrite = {
	key: string;
	value: JsonValue;
};

export type SharedStateUpload = {
	id: string;
	moduleId: string;
	relatedStateKey: string;
	path: string;
	query: Record<string, string>;
	contentType: string;
	data: Blob;
	createdAt: number;
	expectedResponse: JsonValue;
};

function containsExpectedValue(actual: JsonValue, expected: JsonValue): boolean {
	if (Array.isArray(expected)) {
		return (
			Array.isArray(actual) &&
			actual.length === expected.length &&
			expected.every((value, index) => containsExpectedValue(actual[index], value))
		);
	}
	if (expected !== null && typeof expected === 'object') {
		return (
			actual !== null &&
			typeof actual === 'object' &&
			!Array.isArray(actual) &&
			Object.entries(expected).every(
				([key, value]) => key in actual && containsExpectedValue(actual[key], value)
			)
		);
	}
	return Object.is(actual, expected);
}

export class SharedState {
	values = $state<Record<string, JsonValue>>({});
	status = $state<SyncStatus>({ phase: 'idle', pending: 0 });
	pendingUploadIds = $state<string[]>([]);
	ready = $state(false);

	private readonly databaseNameOverride: string | undefined;
	private readonly fetcher: typeof fetch;
	private readonly now: () => number;
	private readonly randomId: () => string;
	private databasePromise: Promise<IDBPDatabase<GjemmekontorDatabase>> | undefined;
	private initializePromise: Promise<void> | undefined;
	private syncPromise: Promise<void> | undefined;
	private pullRequested = false;
	private writeTail: Promise<void> = Promise.resolve();
	private activeWrites = 0;
	private stopSyncTriggers: (() => void) | undefined;
	private started = false;
	private closing = false;
	private tripId: string | undefined;

	constructor(options: SharedStateOptions = {}) {
		this.tripId = options.tripId ?? (options.databaseName ? 'test-trip' : undefined);
		this.databaseNameOverride = options.databaseName;
		this.fetcher = options.fetcher ?? fetch;
		this.now = options.now ?? Date.now;
		this.randomId = options.randomId ?? (() => crypto.randomUUID());
	}

	private database(): Promise<IDBPDatabase<GjemmekontorDatabase>> {
		if (!this.databasePromise) {
			if (!this.tripId) {
				throw new Error('TRIP_ID_REQUIRED');
			}
			this.databasePromise = openClientDatabase(
				this.databaseNameOverride ?? tripClientDatabaseName(this.tripId)
			);
		}
		return this.databasePromise;
	}

	private stateApiPath(path = ''): string {
		if (!this.tripId) {
			throw new Error('TRIP_ID_REQUIRED');
		}
		return `/api/trips/${encodeURIComponent(this.tripId)}/state${path}`;
	}

	private isOnline(): boolean {
		return typeof navigator === 'undefined' || navigator.onLine !== false;
	}

	private isVisible(): boolean {
		return typeof document === 'undefined' || document.visibilityState === 'visible';
	}

	private readonly requestSync = (): void => {
		if (this.isOnline() && this.isVisible()) {
			void this.sync();
		}
	};

	async initialize(): Promise<void> {
		if (this.ready) {
			return;
		}
		if (!this.initializePromise) {
			this.initializePromise = this.performInitialize().finally((): void => {
				this.initializePromise = undefined;
			});
		}
		return this.initializePromise;
	}

	private async performInitialize(): Promise<void> {
		const db = await this.database();
		const entries = await db.getAll('state');
		this.values = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
		this.status = { phase: this.isOnline() ? 'idle' : 'offline', pending: 0 };
		this.ready = true;
	}

	async clientId(): Promise<string> {
		return getClientId(await this.database());
	}

	async set(key: string, value: JsonValue): Promise<void> {
		await this.setMany([{ key, value }]);
	}

	async setMany(writes: readonly SharedStateWrite[]): Promise<void> {
		if (writes.length === 0) {
			return;
		}
		const keys = writes.map((write) => write.key);
		if (keys.some((key) => !key) || keys.some((key, index) => keys.indexOf(key) !== index)) {
			throw new Error('INVALID_STATE_WRITES');
		}
		await this.enqueueWrite(writes);
	}

	async setWithUpload(key: string, value: JsonValue, upload: SharedStateUpload): Promise<void> {
		await this.enqueueWrite([{ key, value }], upload);
	}

	isUploadPending(id: string): boolean {
		return this.pendingUploadIds.includes(id);
	}

	private async enqueueWrite(
		writes: readonly SharedStateWrite[],
		upload?: SharedStateUpload
	): Promise<void> {
		if (!this.isOnline()) {
			this.status = { phase: 'offline', pending: 0 };
			throw new Error('OFFLINE');
		}
		await this.initialize();
		this.activeWrites += writes.length;
		this.status = { phase: 'saving', pending: this.activeWrites };
		const operation = this.writeTail
			.catch(() => undefined)
			.then(() => this.performWrite(writes, upload));
		this.writeTail = operation.catch(() => undefined);
		try {
			await operation;
		} finally {
			this.activeWrites -= writes.length;
			if (this.status.phase === 'saving') {
				this.status = {
					phase: this.activeWrites > 0 ? 'saving' : 'synced',
					pending: this.activeWrites
				};
			} else {
				this.status = { ...this.status, pending: this.activeWrites };
			}
		}
	}

	private async performWrite(
		writes: readonly SharedStateWrite[],
		upload?: SharedStateUpload
	): Promise<void> {
		if (!this.isOnline()) throw new Error('OFFLINE');
		const clientId = await this.clientId();
		try {
			if (upload) {
				this.pendingUploadIds = [...this.pendingUploadIds, upload.id];
				const params = new SvelteURLSearchParams({ ...upload.query, clientId });
				const response = await this.fetcher(`${upload.path}?${params}`, {
					method: 'PUT',
					headers: { 'content-type': upload.contentType },
					body: upload.data
				});
				if (!response.ok) throw new Error('GPX_UPLOAD_FAILED');
				const body = z.json().parse(await response.json());
				if (!containsExpectedValue(body, upload.expectedResponse)) {
					throw new Error('UPLOAD_RESPONSE_MISMATCH');
				}
			}
			const mutationIds = writes.map(() => this.randomId());
			const response = await this.fetcher(this.stateApiPath('/sync'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					mutations: writes.map((write, index) => ({
						mutationId: mutationIds[index],
						clientId,
						key: write.key,
						value: write.value,
						clientTimestamp: this.now()
					}))
				})
			});
			if (!response.ok) throw new Error('SYNC_PUSH_FAILED');
			connectivity.reportNetworkSuccess();
			const pushed = syncResponseSchema.parse(await response.json());
			if (mutationIds.some((id) => !pushed.acknowledgedMutationIds.includes(id))) {
				throw new Error('SYNC_ACK_MISMATCH');
			}
			await this.sync();
		} catch (error) {
			connectivity.reportNetworkFailure(error);
			this.status = {
				phase: !this.isOnline() || error instanceof TypeError ? 'offline' : 'error',
				pending: this.activeWrites
			};
			throw error;
		} finally {
			if (upload) {
				this.pendingUploadIds = this.pendingUploadIds.filter((id) => id !== upload.id);
			}
		}
	}

	async sync(): Promise<void> {
		if (this.syncPromise) {
			this.pullRequested = true;
			return this.syncPromise;
		}
		if (!this.isOnline()) {
			this.status = { phase: 'offline', pending: this.activeWrites };
			return;
		}

		this.syncPromise = (async (): Promise<void> => {
			do {
				this.pullRequested = false;
				await this.performPull();
			} while (this.pullRequested && !this.closing);
		})().finally((): void => {
			this.syncPromise = undefined;
		});
		return this.syncPromise;
	}

	private async performPull(): Promise<void> {
		const db = await this.database();
		try {
			const revisionRecord = await db.get('meta', 'serverRevision');
			const revision = typeof revisionRecord?.value === 'number' ? revisionRecord.value : 0;
			const pullResponse = await this.fetcher(`${this.stateApiPath()}?since=${revision}`);
			if (!pullResponse.ok) {
				throw new Error('SYNC_PULL_FAILED');
			}
			connectivity.reportNetworkSuccess();
			const pulled = stateResponseSchema.parse(await pullResponse.json());
			const transaction = db.transaction(['state', 'meta'], 'readwrite');
			if (revision === 0) await transaction.objectStore('state').clear();
			for (const entry of pulled.entries) {
				await transaction.objectStore('state').put(entry);
			}
			await transaction.objectStore('meta').put({
				key: 'serverRevision',
				value: pulled.revision
			});
			await transaction.done;
			const entries = await db.getAll('state');
			this.values = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
			this.status = {
				phase: this.activeWrites > 0 ? 'saving' : 'synced',
				pending: this.activeWrites
			};
		} catch (error) {
			connectivity.reportNetworkFailure(error);
			if (this.closing) {
				return;
			}
			this.status = {
				phase: !this.isOnline() || error instanceof TypeError ? 'offline' : 'error',
				pending: this.activeWrites
			};
		}
	}

	async start(tripId: string): Promise<void> {
		if (this.started && this.tripId === tripId) {
			return;
		}
		if (this.tripId && this.tripId !== tripId) {
			await this.resetForTrip(tripId);
		} else {
			this.tripId = tripId;
		}
		this.started = true;
		await this.initialize();
		this.stopSyncTriggers = startSyncTriggers(this.requestSync);
		await this.sync();
	}

	private async resetForTrip(tripId: string): Promise<void> {
		this.closing = true;
		this.stop();
		if (this.syncPromise) {
			await this.syncPromise;
		}
		if (this.databasePromise) {
			const db = await this.databasePromise;
			db.close();
		}
		this.databasePromise = undefined;
		this.initializePromise = undefined;
		this.syncPromise = undefined;
		this.pullRequested = false;
		this.writeTail = Promise.resolve();
		this.activeWrites = 0;
		this.values = {};
		this.status = { phase: 'idle', pending: 0 };
		this.pendingUploadIds = [];
		this.ready = false;
		this.tripId = tripId;
		this.closing = false;
	}

	stop(): void {
		if (!this.started) {
			return;
		}
		this.started = false;
		this.stopSyncTriggers?.();
		this.stopSyncTriggers = undefined;
	}

	async close(): Promise<void> {
		this.closing = true;
		this.stop();
		if (this.databasePromise) {
			const db = await this.databasePromise;
			db.close();
			this.databasePromise = undefined;
		}
		this.ready = false;
		this.tripId = undefined;
	}
}

export const sharedState = new SharedState();
