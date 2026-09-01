import type { IDBPDatabase } from 'idb';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import {
	type GjemmekontorDatabase,
	type JsonValue,
	openTripClientDatabase,
	type PendingApiCommand
} from './database';
import { startSyncTriggers } from './sync-triggers';

export type OfflineApiPhase = 'idle' | 'saving' | 'synced' | 'offline' | 'error' | 'conflict';
export type OfflineApiStatus = { phase: OfflineApiPhase; pending: number; conflicts: number };
export type OfflineApiRequest = {
	path: string;
	method: PendingApiCommand['method'];
	body?: JsonValue;
};

const defaultStatus = (): OfflineApiStatus => ({ phase: 'idle', pending: 0, conflicts: 0 });

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

export class OfflineApi {
	statuses = $state<Record<string, OfflineApiStatus>>({});

	private tripId: string | undefined;
	private databasePromise: Promise<IDBPDatabase<GjemmekontorDatabase>> | undefined;
	private enabledModuleIds = new SvelteSet<string>();
	private syncing = new SvelteMap<string, Promise<void>>();
	private refreshers = new SvelteMap<string, SvelteSet<() => void | Promise<void>>>();
	private stopSyncTriggers: (() => void) | undefined;
	private started = false;

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

	status(moduleId: string): OfflineApiStatus {
		return this.statuses[moduleId] ?? defaultStatus();
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

	async commit(
		moduleId: string,
		snapshotKey: string,
		snapshot: unknown,
		requests: readonly OfflineApiRequest[]
	): Promise<void> {
		if (!requests.length) {
			await this.storeSnapshot(snapshotKey, snapshot);
			return;
		}
		const db = await this.database();
		const transaction = db.transaction(['moduleData', 'pendingApiCommands', 'meta'], 'readwrite', {
			durability: 'strict'
		});
		const sequenceRecord = await transaction.objectStore('meta').get('apiCommandSequence');
		const previousSequence = typeof sequenceRecord?.value === 'number' ? sequenceRecord.value : 0;
		await transaction.objectStore('moduleData').put({
			key: snapshotKey,
			value: cloneForStorage(snapshot),
			updatedAt: Date.now()
		});
		for (const [index, request] of requests.entries()) {
			await transaction.objectStore('pendingApiCommands').put({
				id: crypto.randomUUID(),
				moduleId,
				path: request.path,
				method: request.method,
				...(request.body === undefined ? {} : { body: cloneForStorage(request.body) }),
				createdAt: Date.now(),
				sequence: previousSequence + index + 1
			});
		}
		await transaction.objectStore('meta').put({
			key: 'apiCommandSequence',
			value: previousSequence + requests.length
		});
		await transaction.done;
		await this.updateStatus(moduleId, this.isOnline() ? 'saving' : 'offline');
		if (this.isOnline()) void this.sync(moduleId);
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

	private async counts(moduleId: string): Promise<{ pending: number; conflicts: number }> {
		const db = await this.database();
		const [commands, conflicts] = await Promise.all([
			db.getAll('pendingApiCommands'),
			db.getAll('apiCommandConflicts')
		]);
		return {
			pending: commands.filter((command) => command.moduleId === moduleId).length,
			conflicts: conflicts.filter((conflict) => conflict.moduleId === moduleId).length
		};
	}

	private async updateStatus(moduleId: string, requestedPhase?: OfflineApiPhase): Promise<void> {
		const count = await this.counts(moduleId);
		const phase = count.conflicts
			? 'conflict'
			: (requestedPhase ?? (this.isOnline() ? (count.pending ? 'saving' : 'synced') : 'offline'));
		this.statuses = { ...this.statuses, [moduleId]: { phase, ...count } };
	}

	async hasPending(moduleId: string): Promise<boolean> {
		return (await this.counts(moduleId)).pending > 0;
	}

	async sync(moduleId?: string): Promise<void> {
		if (moduleId) {
			await this.syncModule(moduleId);
			return;
		}
		await Promise.all([...this.enabledModuleIds].map((id) => this.syncModule(id)));
	}

	private async syncModule(moduleId: string): Promise<void> {
		const existing = this.syncing.get(moduleId);
		if (existing) return existing;
		const promise = this.performSync(moduleId).finally(() => this.syncing.delete(moduleId));
		this.syncing.set(moduleId, promise);
		return promise;
	}

	private async performSync(moduleId: string): Promise<void> {
		const db = await this.database();
		if (!this.isOnline()) {
			await this.updateStatus(moduleId, 'offline');
			return;
		}
		const commands = (await db.getAll('pendingApiCommands'))
			.filter((command) => command.moduleId === moduleId)
			.sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
		if (commands.length) await this.updateStatus(moduleId, 'saving');
		try {
			for (const command of commands) {
				const response = await fetch(command.path, {
					method: command.method,
					headers: {
						'x-idempotency-key': command.id,
						...(command.body === undefined ? {} : { 'content-type': 'application/json' })
					},
					body: command.body === undefined ? undefined : JSON.stringify(command.body)
				});
				if (response.ok) {
					await db.delete('pendingApiCommands', command.id);
					continue;
				}
				let body: unknown;
				try {
					body = await response.json();
				} catch {
					body = undefined;
				}
				if (response.status >= 400 && response.status < 500 && response.status !== 408) {
					const transaction = db.transaction(
						['pendingApiCommands', 'apiCommandConflicts'],
						'readwrite',
						{ durability: 'strict' }
					);
					await transaction.objectStore('apiCommandConflicts').put({
						...command,
						status: response.status,
						code: responseCode(response, body),
						failedAt: Date.now()
					});
					await transaction.objectStore('pendingApiCommands').delete(command.id);
					await transaction.done;
					continue;
				}
				throw new Error(responseCode(response, body));
			}
			await this.updateStatus(moduleId);
			const count = await this.counts(moduleId);
			if (!count.pending && !count.conflicts) {
				for (const refresher of this.refreshers.get(moduleId) ?? []) await refresher();
			}
		} catch (error) {
			await this.updateStatus(
				moduleId,
				!this.isOnline() || error instanceof TypeError ? 'offline' : 'error'
			);
		}
	}

	private readonly requestSync = (): void => {
		if (
			this.isOnline() &&
			(typeof document === 'undefined' || document.visibilityState === 'visible')
		) {
			void this.sync();
		} else {
			for (const moduleId of this.enabledModuleIds) void this.updateStatus(moduleId, 'offline');
		}
	};

	async start(tripId: string, enabledModuleIds: readonly string[]): Promise<void> {
		if (this.started) this.stop();
		if (this.tripId && this.tripId !== tripId) await this.closeDatabase();
		this.prepare(tripId, enabledModuleIds);
		this.started = true;
		for (const moduleId of this.enabledModuleIds) await this.updateStatus(moduleId);
		this.stopSyncTriggers = startSyncTriggers(this.requestSync, { includeOffline: true });
		await this.sync();
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;
		this.stopSyncTriggers?.();
		this.stopSyncTriggers = undefined;
	}

	private async closeDatabase(): Promise<void> {
		this.stop();
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

export const offlineApi = new OfflineApi();
