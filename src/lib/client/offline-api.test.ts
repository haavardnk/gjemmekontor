import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { openTripClientDatabase, tripClientDatabaseName } from './database';
import { OfflineApi } from './offline-api.svelte';

const tripIds: string[] = [];
const stores: OfflineApi[] = [];

function tripId(): string {
	const id = `offline-api-${crypto.randomUUID()}`;
	tripIds.push(id);
	return id;
}

afterEach(async () => {
	vi.unstubAllGlobals();
	for (const store of stores.splice(0)) await store.close();
	for (const id of tripIds.splice(0)) await deleteDB(tripClientDatabaseName(id));
});

describe('offline API outbox', () => {
	test('persists an optimistic snapshot and replays its command after restart', async () => {
		const id = tripId();
		vi.stubGlobal('navigator', { onLine: false });
		const offline = new OfflineApi();
		stores.push(offline);
		await offline.start(id, ['gear']);
		await offline.commit('gear', 'gear:snapshot:current', { items: [{ id: 'local' }] }, [
			{ path: '/api/gear/items/local/packing', method: 'PATCH', body: { packed: true } }
		]);

		expect(await offline.loadSnapshot('gear:snapshot:current')).toEqual({
			items: [{ id: 'local' }]
		});
		expect(offline.status('gear')).toMatchObject({ phase: 'offline', pending: 1 });
		await offline.close();
		stores.splice(stores.indexOf(offline), 1);

		const fetcher = vi.fn(async () => Response.json({ packed: true }));
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('fetch', fetcher);
		const restarted = new OfflineApi();
		stores.push(restarted);
		await restarted.start(id, ['gear']);

		expect(fetcher).toHaveBeenCalledWith(
			'/api/gear/items/local/packing',
			expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ packed: true }) })
		);
		expect(restarted.status('gear')).toMatchObject({ phase: 'synced', pending: 0 });
	});

	test('moves rejected commands to a durable conflict instead of retrying forever', async () => {
		const id = tripId();
		vi.stubGlobal('navigator', { onLine: false });
		const store = new OfflineApi();
		stores.push(store);
		await store.start(id, ['gear']);
		await store.commit('gear', 'gear:snapshot:current', { categories: [] }, [
			{
				path: '/api/gear/categories',
				method: 'PATCH',
				body: { categoryIds: [] }
			}
		]);

		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ error: 'CATEGORY_ORDER_STALE' }, { status: 409 }))
		);
		await store.sync('gear');

		expect(store.status('gear')).toMatchObject({ phase: 'conflict', pending: 0, conflicts: 1 });
		const db = await openTripClientDatabase(id);
		expect(await db.count('pendingApiCommands')).toBe(0);
		expect(await db.getAll('apiCommandConflicts')).toEqual([
			expect.objectContaining({ moduleId: 'gear', code: 'CATEGORY_ORDER_STALE', status: 409 })
		]);
		db.close();
	});
});
