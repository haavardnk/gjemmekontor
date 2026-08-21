import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, test } from 'vitest';

import type { HandlelisteSnapshot } from '$lib/trip/handleliste';

import { openClientDatabase } from './database';
import { storedHandlelisteSnapshot, storeHandlelisteSnapshot } from './handleliste';

const databaseNames: string[] = [];

afterEach(async (): Promise<void> => {
	for (const name of databaseNames.splice(0)) {
		await deleteDB(name);
	}
});

function databaseName(): string {
	const name = `gjemmekontor-handleliste-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

const snapshot: HandlelisteSnapshot = {
	listUuid: 'trip-list',
	listName: 'Kroatia',
	items: [{ sourceName: 'Milch', name: 'Melk', specification: '2 liter' }],
	recentItems: [{ sourceName: 'Eier', name: 'Egg', specification: '' }],
	fetchedAt: '2026-08-21T10:00:00.000Z'
};

describe('Handleliste cache', (): void => {
	test('stores and restores the current Bring snapshot', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());

		await storeHandlelisteSnapshot(snapshot, database);

		expect(await storedHandlelisteSnapshot(database)).toEqual(snapshot);
		database.close();
	});

	test('adds the snapshot store without losing version 2 data', async (): Promise<void> => {
		const name = databaseName();
		const oldDatabase = await openDB(name, 2, {
			upgrade(database): void {
				database.createObjectStore('state', { keyPath: 'key' });
				database.createObjectStore('mutations', { keyPath: 'mutationId' });
				database.createObjectStore('mapSnapshot', { keyPath: 'id' });
				database.createObjectStore('offlineMap', { keyPath: 'id' });
				database.createObjectStore('meta', { keyPath: 'key' });
				database.createObjectStore('pendingGpxUploads', { keyPath: 'id' });
			}
		});
		await oldDatabase.put('meta', { key: 'clientId', value: 'existing-client' });
		oldDatabase.close();

		const upgraded = await openClientDatabase(name);

		expect(upgraded.objectStoreNames.contains('handlelisteSnapshot')).toBe(true);
		expect(await upgraded.get('meta', 'clientId')).toEqual({
			key: 'clientId',
			value: 'existing-client'
		});
		upgraded.close();
	});
});
