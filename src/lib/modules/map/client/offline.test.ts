import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { openClientDatabase } from '$lib/client/database';

import type { MapSnapshot } from '../domain/types';
import {
	downloadOfflineMap,
	removeOfflineMap,
	storedMapSnapshot,
	storedOfflineMaps,
	storeMapSnapshot
} from './offline';

const databaseNames: string[] = [];

afterEach(async (): Promise<void> => {
	for (const name of databaseNames.splice(0)) {
		await deleteDB(name);
	}
});

function databaseName(): string {
	const name = `gjemmekontor-offline-map-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

describe('offline maps', (): void => {
	test('stores and restores the latest map snapshot', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());
		const snapshot = {
			version: 1,
			type: 'FeatureCollection',
			title: 'Trip map',
			description: '',
			fetchedAt: '2026-08-20T10:00:00.000Z',
			sourceHash: 'hash',
			bounds: [15.7, 42.7, 17, 43.7],
			layers: [],
			sourceStyles: [],
			features: []
		} satisfies MapSnapshot;

		await storeMapSnapshot(database, snapshot);

		expect((await storedMapSnapshot(database))?.value).toEqual(snapshot);
		database.close();
	});

	test('rejects a cached snapshot with stale category semantics', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());
		await database.put('moduleData', {
			key: 'map:snapshot:current',
			updatedAt: Date.now(),
			value: {
				version: 1,
				type: 'FeatureCollection',
				title: 'Trip map',
				description: '',
				fetchedAt: '2026-08-20T10:00:00.000Z',
				sourceHash: 'hash',
				bounds: [15.7, 42.7, 17, 43.7],
				layers: [],
				sourceStyles: [
					{
						key: 'source-style-old',
						color: '#9a5b3f',
						iconHref: '',
						iconCode: '1577',
						symbol: 'restaurant-mooring',
						label: 'Restaurantfortøyninger',
						count: 1
					}
				],
				features: []
			} as never
		});

		expect(await storedMapSnapshot(database)).toBeUndefined();
		database.close();
	});

	test('downloads, reports progress, stores, and removes a package', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());
		const progress = vi.fn();
		const archive = new Uint8Array([80, 77, 84, 105, 108, 101, 115, 3]);
		const fetcher = vi.fn(async (): Promise<Response> => {
			return new Response(archive);
		});

		const record = await downloadOfflineMap(
			database,
			{
				mode: 'normal',
				name: 'Vanlig kart',
				version: 'v1',
				size: archive.byteLength,
				url: '/api/map/offline/normal'
			},
			progress,
			fetcher
		);
		expect(record).toMatchObject({ id: 'normal', size: 8, version: 'v1' });
		expect(progress).toHaveBeenLastCalledWith({ received: 8, total: 8 });
		expect(await storedOfflineMaps(database)).toHaveLength(1);

		await removeOfflineMap(database, 'normal');
		expect(await storedOfflineMaps(database)).toEqual([]);
		database.close();
	});

	test('rejects an incomplete package without storing it', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());
		const fetcher = vi.fn(async (): Promise<Response> => {
			return new Response(new Uint8Array([1, 2]));
		});

		await expect(
			downloadOfflineMap(
				database,
				{
					mode: 'satellite',
					name: 'Satellitt',
					version: 'v1',
					size: 4,
					url: '/api/map/offline/satellite'
				},
				() => undefined,
				fetcher
			)
		).rejects.toThrow('OFFLINE_MAP_SIZE_MISMATCH');
		expect(await storedOfflineMaps(database)).toEqual([]);
		database.close();
	});

	test('rejects a file without a PMTiles signature', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());
		const fetcher = vi.fn(async (): Promise<Response> => {
			return new Response(new Uint8Array([1, 2, 3, 4]));
		});

		await expect(
			downloadOfflineMap(
				database,
				{
					mode: 'nautical',
					name: 'Sjøkart',
					version: 'v1',
					size: 4,
					url: '/api/map/offline/nautical'
				},
				() => undefined,
				fetcher
			)
		).rejects.toThrow('OFFLINE_MAP_INVALID');
		expect(await storedOfflineMaps(database)).toEqual([]);
		database.close();
	});
});
