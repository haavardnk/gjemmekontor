import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { type CachedResourceDependencies, createCachedResource } from './cached-resource';
import { connectivity } from './connectivity.svelte';

const schema = z.object({ items: z.array(z.string()) }).strict();
type Snapshot = z.infer<typeof schema>;

function dependencies(options: {
	cached?: unknown;
	remote?: unknown;
}): CachedResourceDependencies & {
	loadSnapshotMock: ReturnType<typeof vi.fn>;
	mutateMock: ReturnType<typeof vi.fn>;
	requestMock: ReturnType<typeof vi.fn>;
	storeSnapshotMock: ReturnType<typeof vi.fn>;
	unregister: () => void;
} {
	const unregister = vi.fn();
	const loadSnapshotMock = vi.fn(async (key: string): Promise<unknown> => {
		void key;
		return options.cached;
	});
	const loadSnapshot = async <T>(key: string): Promise<T | undefined> =>
		(await loadSnapshotMock(key)) as T | undefined;
	const mutateMock = vi.fn(async () => undefined);
	const requestMock = vi.fn(async () => options.remote);
	const storeSnapshotMock = vi.fn(async () => undefined);
	return {
		loadSnapshotMock,
		mutateMock,
		requestMock,
		storeSnapshotMock,
		unregister,
		store: {
			loadSnapshot,
			mutate: mutateMock,
			registerRefresher: vi.fn(() => (): void => unregister()),
			storeSnapshot: storeSnapshotMock
		},
		request: requestMock as CachedResourceDependencies['request']
	};
}

describe('cached resource', (): void => {
	test('keeps fresh initial data instead of replacing it with an older cache', async (): Promise<void> => {
		let current: Snapshot = { items: ['server'] };
		const deps = dependencies({ cached: { items: ['stale'] } });
		const resource = createCachedResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				schema,
				read: () => current,
				write: (value) => (current = value),
				autoRefresh: false
			},
			deps
		);

		resource.start();
		await vi.waitFor(() =>
			expect(deps.storeSnapshotMock).toHaveBeenCalledWith('test:snapshot', {
				items: ['server']
			})
		);

		expect(current).toEqual({ items: ['server'] });
		expect(deps.loadSnapshotMock).toHaveBeenCalledOnce();
	});

	test('restores the previous cache when an offline shell refresh fails', async (): Promise<void> => {
		let current: Snapshot = { items: [] };
		const deps = dependencies({ cached: { items: ['cached'] } });
		deps.requestMock.mockRejectedValue(new TypeError('network'));
		const resource = createCachedResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				endpoint: '/api/test',
				schema,
				read: () => current,
				write: (value) => (current = value)
			},
			deps
		);

		resource.start();
		await vi.waitFor(() => expect(current).toEqual({ items: ['cached'] }));

		expect(connectivity.online).toBe(false);
		connectivity.reportNetworkSuccess();
	});

	test('loads cached data when no initial snapshot exists', async (): Promise<void> => {
		let current: Snapshot | undefined;
		const deps = dependencies({ cached: { items: ['cached'] } });
		const resource = createCachedResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				schema,
				read: () => current,
				write: (value) => (current = value),
				autoRefresh: false
			},
			deps
		);

		resource.start();
		await vi.waitFor(() => expect(current).toEqual({ items: ['cached'] }));
	});

	test('publishes only the authoritative refresh after a mutation', async (): Promise<void> => {
		let current: Snapshot = { items: ['before'] };
		let refresher: (() => Promise<void>) | undefined;
		const deps = dependencies({ remote: { items: ['server'] } });
		deps.store.registerRefresher = vi.fn(
			(_moduleId: string, value: () => void | Promise<void>): (() => void) => {
				refresher = async (): Promise<void> => {
					await value();
				};
				return (): void => deps.unregister();
			}
		);
		deps.mutateMock.mockImplementation(async () => refresher?.());
		const resource = createCachedResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				endpoint: '/api/test',
				schema,
				read: () => current,
				write: (value) => (current = value),
				autoRefresh: false
			},
			deps
		);
		resource.start();

		await resource.commit({ items: ['unpublished'] }, [
			{ path: '/api/test', method: 'POST', body: { item: 'requested' } }
		]);

		expect(deps.mutateMock).toHaveBeenCalledWith('test', [
			{ path: '/api/test', method: 'POST', body: { item: 'requested' } }
		]);
		expect(current).toEqual({ items: ['server'] });
	});

	test('does not publish an in-flight response after a mutation begins', async (): Promise<void> => {
		const remote = Promise.withResolvers<Snapshot>();
		let current: Snapshot = { items: ['initial'] };
		const deps = dependencies({});
		deps.requestMock.mockImplementation(async () => remote.promise);
		const resource = createCachedResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				endpoint: '/api/test',
				schema,
				read: () => current,
				write: (value) => (current = value),
				autoRefresh: false
			},
			deps
		);
		resource.start();
		const refreshing = resource.refresh();
		await vi.waitFor(() => expect(deps.requestMock).toHaveBeenCalledOnce());
		await resource.commit({ items: ['ignored'] }, [{ path: '/api/test', method: 'POST' }]);
		remote.resolve({ items: ['stale'] });
		await refreshing;

		expect(current).toEqual({ items: ['initial'] });
		expect(deps.storeSnapshotMock).not.toHaveBeenCalledWith('test:snapshot', {
			items: ['stale']
		});
	});

	test('runs one trailing refresh requested during an active refresh', async (): Promise<void> => {
		const firstRemote = Promise.withResolvers<Snapshot>();
		let current: Snapshot = { items: ['initial'] };
		const deps = dependencies({});
		deps.requestMock
			.mockImplementationOnce(async () => firstRemote.promise)
			.mockResolvedValueOnce({ items: ['fresh'] });
		const resource = createCachedResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				endpoint: '/api/test',
				schema,
				read: () => current,
				write: (value) => (current = value),
				autoRefresh: false
			},
			deps
		);
		resource.start();
		const first = resource.refresh();
		await vi.waitFor(() => expect(deps.requestMock).toHaveBeenCalledOnce());
		const trailing = resource.refresh();
		firstRemote.resolve({ items: ['stale'] });
		await Promise.all([first, trailing]);

		expect(deps.requestMock).toHaveBeenCalledTimes(2);
		expect(current).toEqual({ items: ['fresh'] });
	});
});
