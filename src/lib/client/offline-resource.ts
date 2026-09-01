import type { ZodType } from 'zod';

import { apiRequest } from './api';
import { type OfflineApi, offlineApi, type OfflineApiRequest } from './offline-api.svelte';

export type OfflineResourceRequest = OfflineApiRequest;

export type OfflineResourceMutation<T> = {
	next: T;
	requests: readonly OfflineResourceRequest[];
};

export type OfflineResourceRefreshOptions = {
	load?: () => Promise<unknown>;
};

export class InvalidOfflineResourceSnapshotError extends Error {
	constructor() {
		super('INVALID_OFFLINE_RESOURCE_SNAPSHOT');
		this.name = 'InvalidOfflineResourceSnapshotError';
	}
}

type OfflineResourceOptions<T, TCurrent extends T | undefined> = {
	moduleId: string;
	snapshotKey: string;
	endpoint?: string;
	load?: () => Promise<unknown>;
	select?: (response: unknown) => unknown;
	schema: ZodType<T>;
	read: () => TCurrent;
	write: (value: T) => void;
	canRefresh?: () => boolean | Promise<boolean>;
	onCached?: (value: T) => void | Promise<void>;
	onReady?: () => void | Promise<void>;
	onRefreshSuccess?: (value: T, response: unknown) => void | Promise<void>;
	onRefreshError?: (error: unknown) => void | Promise<void>;
	autoRefresh?: boolean;
	registerRefresher?: boolean;
};

export type OfflineResourceDependencies = {
	store: Pick<
		OfflineApi,
		'commit' | 'hasPending' | 'loadSnapshot' | 'registerRefresher' | 'storeSnapshot'
	>;
	request: typeof apiRequest;
};

export function createOfflineResource<T, TCurrent extends T | undefined = T>(
	options: OfflineResourceOptions<T, TCurrent>,
	dependencies: OfflineResourceDependencies = { store: offlineApi, request: apiRequest }
) {
	const { moduleId, snapshotKey, schema, read, write } = options;
	const { store, request } = dependencies;
	let active = false;
	let lifecycleRevision = 0;
	let mutationRevision = 0;
	let refreshPromise: Promise<boolean> | undefined;
	const isActive = (lifecycle: number): boolean => active && lifecycle === lifecycleRevision;
	const isCurrent = (lifecycle: number, revision: number): boolean =>
		isActive(lifecycle) && revision === mutationRevision;

	const loadRemote = (): Promise<unknown> => {
		if (options.load) return options.load();
		if (options.endpoint) return request(options.endpoint);
		throw new Error('OFFLINE_RESOURCE_LOADER_REQUIRED');
	};

	const performRefresh = async (
		refreshOptions: OfflineResourceRefreshOptions
	): Promise<boolean> => {
		if (options.canRefresh && !(await options.canRefresh())) return false;
		if (await store.hasPending(moduleId)) return false;
		const lifecycle = lifecycleRevision;
		const revision = mutationRevision;
		try {
			const response = await (refreshOptions.load ?? loadRemote)();
			const parsed = schema.safeParse(options.select ? options.select(response) : response);
			if (!parsed.success) throw new InvalidOfflineResourceSnapshotError();
			if (!isCurrent(lifecycle, revision) || (await store.hasPending(moduleId))) {
				return false;
			}
			const next = parsed.data;
			write(next);
			await store.storeSnapshot(snapshotKey, next);
			await options.onRefreshSuccess?.(next, response);
			return true;
		} catch (error) {
			if (isCurrent(lifecycle, revision)) await options.onRefreshError?.(error);
			return false;
		}
	};

	const refresh = (refreshOptions: OfflineResourceRefreshOptions = {}): Promise<boolean> => {
		refreshPromise ??= performRefresh(refreshOptions).finally(() => (refreshPromise = undefined));
		return refreshPromise;
	};
	const commit = async (next: T, requests: readonly OfflineResourceRequest[]): Promise<void> => {
		mutationRevision += 1;
		await store.commit(moduleId, snapshotKey, next, requests);
		write(next);
	};

	return {
		current: read,
		commit,
		async commitMutation(mutation: OfflineResourceMutation<T>): Promise<void> {
			await commit(mutation.next, mutation.requests);
		},
		refresh,
		start(): () => void {
			active = true;
			lifecycleRevision += 1;
			const lifecycle = lifecycleRevision;
			const revision = mutationRevision;
			const initial = read();
			void store.loadSnapshot<T>(snapshotKey).then(async (cached) => {
				if (!isActive(lifecycle)) return;
				if (revision === mutationRevision) {
					const cachedResult = schema.safeParse(cached);
					if (cachedResult.success) {
						write(cachedResult.data);
						await options.onCached?.(cachedResult.data);
					} else if (initial !== undefined) {
						await store.storeSnapshot(snapshotKey, initial);
					}
				}
				if (!isActive(lifecycle)) return;
				await options.onReady?.();
				if (
					options.autoRefresh !== false &&
					(typeof navigator === 'undefined' || navigator.onLine !== false)
				) {
					await refresh();
				}
			});
			const unregister =
				options.registerRefresher === false
					? (): void => undefined
					: store.registerRefresher(moduleId, async () => {
							await refresh();
						});
			return (): void => {
				active = false;
				lifecycleRevision += 1;
				unregister();
			};
		}
	};
}
