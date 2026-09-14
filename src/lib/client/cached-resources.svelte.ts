import type { IDBPDatabase } from 'idb';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import { connectivity } from './connectivity.svelte';
import { type GjemmekontorDatabase, type JsonValue, openTripClientDatabase } from './database';
import { startSyncTriggers } from './sync-triggers';

export type CachedResourcePhase = 'idle' | 'saving' | 'synced' | 'offline' | 'error';
export type CachedResourceStatus = {
	phase: CachedResourcePhase;
	pending: number;
};
export type CachedResourceRequest = {
	path: string;
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	body?: JsonValue;
};

type CachedResourcesOptions = {
	fetcher?: typeof fetch;
	randomId?: () => string;
};

const defaultStatus = (): CachedResourceStatus => ({ phase: 'idle', pending: 0 });

function responseCode(response: Response, body: unknown): string {
	if (
		typeof body === 'object' &&
		body !== null &&
		'error' in body &&
		typeof body.error === 'string'
	) {
		return body.error;
	}
	return `HTTP_${response.status}`;
}

function cloneForStorage<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export class CachedResources {
	statuses = $state<Record<string, CachedResourceStatus>>({});

	private readonly fetcher: typeof fetch;
	private readonly randomId: () => string;
	private tripId: string | undefined;
	private databasePromise: Promise<IDBPDatabase<GjemmekontorDatabase>> | undefined;
	private enabledModuleIds = new SvelteSet<string>();
	private mutations = new SvelteMap<string, Promise<void>>();
	private refreshers = new SvelteMap<string, SvelteSet<() => void | Promise<void>>>();
	private stopSyncTriggers: (() => void) | undefined;
	private started = false;

	constructor(options: CachedResourcesOptions = {}) {
		this.fetcher = options.fetcher ?? fetch;
		this.randomId = options.randomId ?? (() => crypto.randomUUID());
	}

	private database(): Promise<IDBPDatabase<GjemmekontorDatabase>> {
		if (!this.tripId) throw new Error('TRIP_ID_REQUIRED');
		this.databasePromise ??= openTripClientDatabase(this.tripId);
		return this.databasePromise;
	}

	private isOnline(): boolean {
		return typeof navigator === 'undefined' || navigator.onLine !== false;
	}

	prepare(tripId: string, enabledModuleIds: readonly string[]): void {
		if (this.tripId && this.tripId !== tripId) {
			this.stop();
			if (this.databasePromise) void this.databasePromise.then((database) => database.close());
			this.databasePromise = undefined;
			this.statuses = {};
			this.refreshers.clear();
		}
		this.tripId = tripId;
		this.enabledModuleIds = new SvelteSet(enabledModuleIds);
	}

	status(moduleId: string): CachedResourceStatus {
		return this.statuses[moduleId] ?? defaultStatus();
	}

	markRefreshed(moduleId: string, succeeded: boolean): void {
		if (this.mutations.has(moduleId)) return;
		this.setStatus(moduleId, succeeded ? 'synced' : this.isOnline() ? 'error' : 'offline', 0);
	}

	async loadSnapshot<T>(key: string): Promise<T | undefined> {
		return (await (await this.database()).get('moduleData', key))?.value as T | undefined;
	}

	async storeSnapshot(key: string, value: unknown): Promise<void> {
		await (
			await this.database()
		).put('moduleData', {
			key,
			value: cloneForStorage(value),
			updatedAt: Date.now()
		});
	}

	registerRefresher(moduleId: string, refresher: () => void | Promise<void>): () => void {
		const current = this.refreshers.get(moduleId) ?? new SvelteSet();
		current.add(refresher);
		this.refreshers.set(moduleId, current);
		return (): void => {
			current.delete(refresher);
			if (!current.size) this.refreshers.delete(moduleId);
		};
	}

	async refresh(moduleId?: string): Promise<void> {
		const moduleIds = moduleId ? [moduleId] : [...this.enabledModuleIds];
		await Promise.all(
			moduleIds.map(async (id): Promise<void> => {
				for (const refresher of this.refreshers.get(id) ?? []) await refresher();
			})
		);
	}

	async mutate(moduleId: string, requests: readonly CachedResourceRequest[]): Promise<void> {
		if (!requests.length) return;
		if (!this.isOnline()) {
			this.setStatus(moduleId, 'offline', 0);
			throw new Error('OFFLINE');
		}
		const previous = this.mutations.get(moduleId) ?? Promise.resolve();
		const operation = previous
			.catch(() => undefined)
			.then(() => this.performMutation(moduleId, requests));
		this.mutations.set(moduleId, operation);
		try {
			await operation;
		} finally {
			if (this.mutations.get(moduleId) === operation) this.mutations.delete(moduleId);
		}
	}

	private async performMutation(
		moduleId: string,
		requests: readonly CachedResourceRequest[]
	): Promise<void> {
		this.setStatus(moduleId, 'saving', requests.length);
		let failure: unknown;
		try {
			for (const request of requests) {
				const response = await this.fetcher(request.path, {
					method: request.method,
					headers: {
						'x-idempotency-key': this.randomId(),
						...(request.body === undefined ? {} : { 'content-type': 'application/json' })
					},
					body: request.body === undefined ? undefined : JSON.stringify(request.body)
				});
				if (response.ok) continue;
				const body = await response.json().catch(() => undefined);
				throw new Error(responseCode(response, body));
			}
		} catch (error) {
			connectivity.reportNetworkFailure(error);
			failure = error;
		} finally {
			await this.refresh(moduleId);
		}
		if (failure) {
			this.setStatus(
				moduleId,
				!this.isOnline() || failure instanceof TypeError ? 'offline' : 'error',
				0
			);
			throw failure;
		}
		connectivity.reportNetworkSuccess();
		this.setStatus(moduleId, 'synced', 0);
	}

	private setStatus(moduleId: string, phase: CachedResourcePhase, pending: number): void {
		this.statuses = { ...this.statuses, [moduleId]: { phase, pending } };
	}

	private readonly requestRefresh = (): void => {
		if (
			this.isOnline() &&
			(typeof document === 'undefined' || document.visibilityState === 'visible')
		) {
			void this.refresh();
			return;
		}
		for (const moduleId of this.enabledModuleIds) this.setStatus(moduleId, 'offline', 0);
	};

	async start(tripId: string, enabledModuleIds: readonly string[]): Promise<void> {
		if (this.started) this.stop();
		if (this.tripId && this.tripId !== tripId) await this.closeDatabase();
		this.prepare(tripId, enabledModuleIds);
		this.started = true;
		for (const moduleId of this.enabledModuleIds) {
			this.setStatus(moduleId, this.isOnline() ? 'idle' : 'offline', 0);
		}
		this.stopSyncTriggers = startSyncTriggers(this.requestRefresh, { includeOffline: true });
		await this.refresh();
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;
		this.stopSyncTriggers?.();
		this.stopSyncTriggers = undefined;
	}

	private async closeDatabase(): Promise<void> {
		this.stop();
		await Promise.allSettled(this.mutations.values());
		if (this.databasePromise) (await this.databasePromise).close();
		this.databasePromise = undefined;
		this.statuses = {};
		this.refreshers.clear();
	}

	async close(): Promise<void> {
		await this.closeDatabase();
		this.tripId = undefined;
	}
}

export const cachedResources = new CachedResources();
