import type { ZodType } from 'zod';

import { apiRequest } from './api';
import {
	type CachedResourceRequest,
	type CachedResources,
	cachedResources
} from './cached-resources.svelte';
import { connectivity } from './connectivity.svelte';

export type { CachedResourceRequest } from './cached-resources.svelte';

export type CachedResourceMutation<T> = {
	next: T;
	requests: readonly CachedResourceRequest[];
};

export type CachedResourceRefreshOptions = {
	load?: () => Promise<unknown>;
};

export type CachedResourceDescriptor<T> = {
	moduleId: string;
	snapshotKey: string;
	endpoint: string;
	select?: (response: unknown) => unknown;
	schema: ZodType<T>;
};

export class InvalidCachedResourceSnapshotError extends Error {
	constructor() {
		super('INVALID_CACHED_RESOURCE_SNAPSHOT');
		this.name = 'InvalidCachedResourceSnapshotError';
	}
}

type CachedResourceOptions<T, TCurrent extends T | undefined> = Omit<
	CachedResourceDescriptor<T>,
	'endpoint'
> & {
	endpoint?: string;
	load?: () => Promise<unknown>;
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

export type CachedResourceDependencies = {
	store: Pick<CachedResources, 'loadSnapshot' | 'mutate' | 'registerRefresher' | 'storeSnapshot'> &
		Partial<Pick<CachedResources, 'markRefreshed'>>;
	request: typeof apiRequest;
};

export function createCachedResource<T, TCurrent extends T | undefined = T>(
	options: CachedResourceOptions<T, TCurrent>,
	dependencies: CachedResourceDependencies = { store: cachedResources, request: apiRequest }
) {
	const { moduleId, snapshotKey, schema, read, write } = options;
	const { store, request } = dependencies;
	let active = false;
	let lifecycleRevision = 0;
	let mutationRevision = 0;
	let refreshPromise: Promise<boolean> | undefined;
	let refreshQueued = false;
	let queuedRefreshOptions: CachedResourceRefreshOptions = {};
	let startupCache: T | undefined;
	const isActive = (lifecycle: number): boolean => active && lifecycle === lifecycleRevision;
	const isCurrent = (lifecycle: number, revision: number): boolean =>
		isActive(lifecycle) && revision === mutationRevision;

	const loadRemote = (): Promise<unknown> => {
		if (options.load) return options.load();
		if (options.endpoint) return request(options.endpoint);
		throw new Error('CACHED_RESOURCE_LOADER_REQUIRED');
	};

	const performRefresh = async (refreshOptions: CachedResourceRefreshOptions): Promise<boolean> => {
		if (options.canRefresh && !(await options.canRefresh())) return false;
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
		const lifecycle = lifecycleRevision;
		const revision = mutationRevision;
		try {
			const response = await (refreshOptions.load ?? loadRemote)();
			const parsed = schema.safeParse(options.select ? options.select(response) : response);
			if (!parsed.success) throw new InvalidCachedResourceSnapshotError();
			if (!isCurrent(lifecycle, revision)) return false;
			const next = parsed.data;
			connectivity.reportNetworkSuccess();
			write(next);
			await store.storeSnapshot(snapshotKey, next);
			await options.onRefreshSuccess?.(next, response);
			store.markRefreshed?.(moduleId, true);
			return true;
		} catch (error) {
			connectivity.reportNetworkFailure(error);
			if (isCurrent(lifecycle, revision)) {
				if (!connectivity.online) {
					const cached = startupCache ?? (await store.loadSnapshot<T>(snapshotKey));
					const cachedResult = schema.safeParse(cached);
					if (cachedResult.success) write(cachedResult.data);
				}
				await options.onRefreshError?.(error);
				store.markRefreshed?.(moduleId, false);
			}
			return false;
		}
	};

	const runRefresh = async (refreshOptions: CachedResourceRefreshOptions): Promise<boolean> => {
		let refreshed = await performRefresh(refreshOptions);
		while (refreshQueued) {
			refreshQueued = false;
			const nextOptions = queuedRefreshOptions;
			queuedRefreshOptions = {};
			refreshed = await performRefresh(nextOptions);
		}
		return refreshed;
	};
	const refresh = (refreshOptions: CachedResourceRefreshOptions = {}): Promise<boolean> => {
		if (refreshPromise) {
			refreshQueued = true;
			queuedRefreshOptions = refreshOptions;
			return refreshPromise;
		}
		refreshPromise = runRefresh(refreshOptions).finally(() => (refreshPromise = undefined));
		return refreshPromise;
	};
	const commit = async (_next: T, requests: readonly CachedResourceRequest[]): Promise<void> => {
		mutationRevision += 1;
		await store.mutate(moduleId, requests);
	};

	return {
		current: read,
		commit,
		async commitMutation(mutation: CachedResourceMutation<T>): Promise<void> {
			await commit(mutation.next, mutation.requests);
		},
		refresh,
		start(): () => void {
			active = true;
			lifecycleRevision += 1;
			const lifecycle = lifecycleRevision;
			const initial = read();
			void (async (): Promise<void> => {
				const cached = await store.loadSnapshot<T>(snapshotKey);
				const cachedResult = schema.safeParse(cached);
				startupCache = cachedResult.success ? cachedResult.data : undefined;
				const initialResult = schema.safeParse(initial);
				if (initialResult.success) {
					await store.storeSnapshot(snapshotKey, initialResult.data);
				} else {
					if (!isActive(lifecycle)) return;
					if (cachedResult.success) {
						write(cachedResult.data);
						await options.onCached?.(cachedResult.data);
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
			})();
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
