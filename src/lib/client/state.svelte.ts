import type { IDBPDatabase } from 'idb';
import { SvelteDate, SvelteSet } from 'svelte/reactivity';
import { z } from 'zod';

import {
	getClientId,
	type GjemmekontorDatabase,
	type JsonValue,
	openClientDatabase,
	type PendingMutation
} from './database';

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
	databaseName?: string;
	fetcher?: typeof fetch;
	now?: () => number;
	randomId?: () => string;
};

export class SharedState {
	values = $state<Record<string, JsonValue>>({});
	status = $state<SyncStatus>({ phase: 'idle', pending: 0 });

	private readonly databaseName: string | undefined;
	private readonly fetcher: typeof fetch;
	private readonly now: () => number;
	private readonly randomId: () => string;
	private databasePromise: Promise<IDBPDatabase<GjemmekontorDatabase>> | undefined;
	private syncPromise: Promise<void> | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private started = false;

	constructor(options: SharedStateOptions = {}) {
		this.databaseName = options.databaseName;
		this.fetcher = options.fetcher ?? fetch;
		this.now = options.now ?? Date.now;
		this.randomId = options.randomId ?? crypto.randomUUID;
	}

	private database(): Promise<IDBPDatabase<GjemmekontorDatabase>> {
		if (!this.databasePromise) {
			this.databasePromise = openClientDatabase(this.databaseName);
		}
		return this.databasePromise;
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
		const db = await this.database();
		const entries = await db.getAll('state');
		const pending = await db.count('mutations');
		this.values = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
		this.status = { phase: this.isOnline() ? 'idle' : 'offline', pending };
	}

	async set(key: string, value: JsonValue): Promise<void> {
		const db = await this.database();
		const clientId = await getClientId(db);
		const mutation: PendingMutation = {
			mutationId: this.randomId(),
			clientId,
			key,
			value,
			clientTimestamp: this.now()
		};
		this.status = { phase: 'saving', pending: this.status.pending + 1 };
		const transaction = db.transaction(['state', 'mutations'], 'readwrite', {
			durability: 'strict'
		});
		const existing = await transaction.objectStore('state').get(key);
		await transaction.objectStore('state').put({
			key,
			value,
			revision: existing?.revision ?? 0,
			clientId,
			mutationId: mutation.mutationId,
			updatedAt: new SvelteDate(mutation.clientTimestamp).toISOString()
		});
		await transaction.objectStore('mutations').put(mutation);
		await transaction.done;
		this.values = { ...this.values, [key]: value };
		this.status = {
			phase: this.isOnline() ? 'saving' : 'offline',
			pending: await db.count('mutations')
		};
		if (this.isOnline()) {
			void this.sync();
		}
	}

	async sync(): Promise<void> {
		if (this.syncPromise) {
			return this.syncPromise;
		}
		if (!this.isOnline()) {
			const db = await this.database();
			this.status = { phase: 'offline', pending: await db.count('mutations') };
			return;
		}

		this.syncPromise = this.performSync().finally((): void => {
			this.syncPromise = undefined;
		});
		return this.syncPromise;
	}

	private async performSync(): Promise<void> {
		const db = await this.database();
		try {
			const pending = await db.getAll('mutations');
			if (pending.length > 0) {
				this.status = { phase: 'saving', pending: pending.length };
				const pushResponse = await this.fetcher('/api/state/sync', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ mutations: pending })
				});
				if (!pushResponse.ok) {
					throw new Error('SYNC_PUSH_FAILED');
				}
				const pushed = syncResponseSchema.parse(await pushResponse.json());
				const transaction = db.transaction('mutations', 'readwrite');
				await Promise.all(
					pushed.acknowledgedMutationIds.map((mutationId) =>
						transaction.objectStore('mutations').delete(mutationId)
					)
				);
				await transaction.done;
			}

			const revisionRecord = await db.get('meta', 'serverRevision');
			const revision = typeof revisionRecord?.value === 'number' ? revisionRecord.value : 0;
			const pullResponse = await this.fetcher(`/api/state?since=${revision}`);
			if (!pullResponse.ok) {
				throw new Error('SYNC_PULL_FAILED');
			}
			const pulled = stateResponseSchema.parse(await pullResponse.json());
			const remaining = await db.getAll('mutations');
			const pendingKeys = new SvelteSet(remaining.map((mutation) => mutation.key));
			const transaction = db.transaction(['state', 'meta'], 'readwrite');
			for (const entry of pulled.entries) {
				if (!pendingKeys.has(entry.key)) {
					await transaction.objectStore('state').put(entry);
				}
			}
			await transaction.objectStore('meta').put({
				key: 'serverRevision',
				value: pulled.revision
			});
			await transaction.done;
			const entries = await db.getAll('state');
			this.values = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
			this.status = {
				phase: remaining.length > 0 ? 'saving' : 'synced',
				pending: remaining.length
			};
		} catch {
			this.status = { phase: 'error', pending: await db.count('mutations') };
		}
	}

	async start(): Promise<void> {
		if (this.started) {
			return;
		}
		this.started = true;
		await this.initialize();
		if (typeof window !== 'undefined') {
			window.addEventListener('online', this.requestSync);
			window.addEventListener('focus', this.requestSync);
		}
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.requestSync);
		}
		this.timer = setInterval(this.requestSync, 15_000);
		await this.sync();
	}

	stop(): void {
		if (!this.started) {
			return;
		}
		this.started = false;
		if (typeof window !== 'undefined') {
			window.removeEventListener('online', this.requestSync);
			window.removeEventListener('focus', this.requestSync);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.requestSync);
		}
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	async close(): Promise<void> {
		this.stop();
		if (this.databasePromise) {
			const db = await this.databasePromise;
			db.close();
			this.databasePromise = undefined;
		}
	}
}

export const sharedState = new SharedState();
