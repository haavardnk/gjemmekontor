import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { createOfflineResource, type OfflineResourceDependencies } from './offline-resource';

const schema = z.object({ items: z.array(z.string()) }).strict();
type Snapshot = z.infer<typeof schema>;

function dependencies(options: {
	cached?: unknown;
	pending?: boolean[];
	remote?: unknown;
}): OfflineResourceDependencies & {
	requestMock: ReturnType<typeof vi.fn>;
	unregister: ReturnType<typeof vi.fn>;
} {
	const unregister = vi.fn();
	const pending = [...(options.pending ?? [])];
	const requestMock = vi.fn(async () => options.remote);
	return {
		requestMock,
		unregister,
		store: {
			commit: vi.fn(async () => undefined),
			hasPending: vi.fn(async () => pending.shift() ?? false),
			loadSnapshot: async <T>() => options.cached as T,
			registerRefresher: vi.fn(() => unregister),
			storeSnapshot: vi.fn(async () => undefined)
		},
		request: requestMock as OfflineResourceDependencies['request']
	};
}

describe('offline resource', () => {
	test('loads a cached snapshot and refreshes it from the server', async () => {
		let current: Snapshot = { items: ['initial'] };
		const deps = dependencies({ cached: { items: ['cached'] }, remote: { items: ['remote'] } });
		const resource = createOfflineResource(
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

		const stop = resource.start();
		await vi.waitFor(() => expect(current).toEqual({ items: ['remote'] }));
		expect(deps.requestMock).toHaveBeenCalledWith('/api/test');
		expect(deps.store.storeSnapshot).toHaveBeenCalledWith('test:snapshot', {
			items: ['remote']
		});

		stop();
		expect(deps.unregister).toHaveBeenCalledOnce();
	});

	test('does not overwrite optimistic state when a command appears during refresh', async () => {
		let current: Snapshot = { items: ['local'] };
		const deps = dependencies({
			cached: { items: ['local'] },
			pending: [false, true],
			remote: { items: ['stale'] }
		});
		const resource = createOfflineResource(
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
		await vi.waitFor(() => expect(deps.requestMock).toHaveBeenCalledOnce());
		expect(current).toEqual({ items: ['local'] });
		expect(deps.store.storeSnapshot).not.toHaveBeenCalled();
	});

	test('persists a commit before publishing its optimistic value', async () => {
		let current: Snapshot = { items: [] };
		const deps = dependencies({});
		const resource = createOfflineResource(
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
		const next = { items: ['saved'] };

		await resource.commit(next, [{ path: '/api/test', method: 'POST', body: next }]);

		expect(deps.store.commit).toHaveBeenCalledWith('test', 'test:snapshot', next, [
			{ path: '/api/test', method: 'POST', body: next }
		]);
		expect(current).toEqual(next);
	});

	test('commits a reusable mutation plan', async () => {
		let current: Snapshot = { items: [] };
		const deps = dependencies({});
		const resource = createOfflineResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				schema,
				read: () => current,
				write: (value) => (current = value)
			},
			deps
		);
		const mutation = {
			next: { items: ['planned'] },
			requests: [{ path: '/api/test', method: 'POST' as const, body: { items: ['planned'] } }]
		};

		await resource.commitMutation(mutation);

		expect(deps.store.commit).toHaveBeenCalledWith(
			'test',
			'test:snapshot',
			mutation.next,
			mutation.requests
		);
		expect(current).toEqual(mutation.next);
	});

	test('does not publish an in-flight response after a local commit', async () => {
		let resolveRemote: (value: Snapshot) => void = () => undefined;
		const remote = new Promise<Snapshot>((resolve) => (resolveRemote = resolve));
		let current: Snapshot = { items: ['initial'] };
		const deps = dependencies({ cached: current });
		deps.requestMock.mockImplementation(async () => remote);
		const resource = createOfflineResource(
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
		await vi.waitFor(() => expect(deps.requestMock).toHaveBeenCalledOnce());
		await resource.commit({ items: ['local'] }, [
			{ path: '/api/test', method: 'POST', body: { items: ['local'] } }
		]);
		resolveRemote({ items: ['stale'] });
		await remote;

		expect(current).toEqual({ items: ['local'] });
		expect(deps.store.storeSnapshot).not.toHaveBeenCalledWith('test:snapshot', {
			items: ['stale']
		});
	});

	test('supports optional state, custom response selection, and lifecycle hooks', async () => {
		let current: Snapshot | undefined;
		const deps = dependencies({});
		const load = vi.fn(async () => ({ result: { items: ['remote'] } }));
		const onReady = vi.fn();
		const onRefreshSuccess = vi.fn();
		const resource = createOfflineResource(
			{
				moduleId: 'test',
				snapshotKey: 'test:snapshot',
				load,
				select: (response) => (response as { result: unknown }).result,
				schema,
				read: () => current,
				write: (value) => (current = value),
				onReady,
				onRefreshSuccess,
				registerRefresher: false
			},
			deps
		);

		resource.start();
		await vi.waitFor(() => expect(current).toEqual({ items: ['remote'] }));

		expect(onReady).toHaveBeenCalledOnce();
		expect(onRefreshSuccess).toHaveBeenCalledWith(
			{ items: ['remote'] },
			{ result: { items: ['remote'] } }
		);
		expect(deps.requestMock).not.toHaveBeenCalled();
		expect(deps.store.registerRefresher).not.toHaveBeenCalled();
	});
});
