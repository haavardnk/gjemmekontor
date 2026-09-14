import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CachedResources } from './cached-resources.svelte';
import { tripClientDatabaseName } from './database';

const tripIds: string[] = [];
const stores: CachedResources[] = [];

function tripId(): string {
	const id = `cached-resources-${crypto.randomUUID()}`;
	tripIds.push(id);
	return id;
}

afterEach(async (): Promise<void> => {
	vi.unstubAllGlobals();
	for (const store of stores.splice(0)) await store.close();
	for (const id of tripIds.splice(0)) await deleteDB(tripClientDatabaseName(id));
});

describe('cached resources', (): void => {
	test('sends direct acknowledged mutations before refreshing', async (): Promise<void> => {
		const fetcher = vi.fn(async (): Promise<Response> => Response.json({ saved: true }));
		const store = new CachedResources({ fetcher, randomId: (): string => 'mutation-a' });
		stores.push(store);
		const refresh = vi.fn();
		store.prepare(tripId(), ['gear']);
		store.registerRefresher('gear', refresh);

		await store.mutate('gear', [
			{ path: '/api/gear/items/a/packing', method: 'PATCH', body: { packed: true } }
		]);

		expect(fetcher).toHaveBeenCalledWith('/api/gear/items/a/packing', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json', 'x-idempotency-key': 'mutation-a' },
			body: JSON.stringify({ packed: true })
		});
		expect(refresh).toHaveBeenCalledOnce();
		expect(store.status('gear')).toEqual({ phase: 'synced', pending: 0 });
	});

	test('rejects mutations while offline', async (): Promise<void> => {
		vi.stubGlobal('navigator', { onLine: false });
		const fetcher = vi.fn();
		const store = new CachedResources({ fetcher });
		stores.push(store);
		store.prepare(tripId(), ['shopping-list']);

		await expect(
			store.mutate('shopping-list', [{ path: '/api/shopping-list/items', method: 'POST' }])
		).rejects.toThrow('OFFLINE');

		expect(fetcher).not.toHaveBeenCalled();
		expect(store.status('shopping-list')).toEqual({ phase: 'offline', pending: 0 });
	});

	test('refreshes authoritative data after a rejected mutation', async (): Promise<void> => {
		const fetcher = vi.fn(async (): Promise<Response> =>
			Response.json({ error: 'STALE' }, { status: 409 })
		);
		const store = new CachedResources({ fetcher });
		stores.push(store);
		const refresh = vi.fn();
		store.prepare(tripId(), ['gear']);
		store.registerRefresher('gear', refresh);

		await expect(
			store.mutate('gear', [{ path: '/api/gear/categories', method: 'PATCH' }])
		).rejects.toThrow('STALE');

		expect(refresh).toHaveBeenCalledOnce();
		expect(store.status('gear')).toEqual({ phase: 'error', pending: 0 });
	});

	test('stores and loads validated snapshot inputs', async (): Promise<void> => {
		const store = new CachedResources();
		stores.push(store);
		store.prepare(tripId(), ['menu']);

		await store.storeSnapshot('menu:snapshot:current', { dishes: ['Pasta'] });

		expect(await store.loadSnapshot('menu:snapshot:current')).toEqual({ dishes: ['Pasta'] });
	});
});
