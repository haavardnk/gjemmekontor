import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, test } from 'vitest';

import { openClientDatabase } from './database';

const databaseNames: string[] = [];

afterEach(async (): Promise<void> => {
	for (const name of databaseNames.splice(0)) await deleteDB(name);
});

function databaseName(): string {
	const name = `gjemmekontor-database-test-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

describe('client database', (): void => {
	test('creates only read-cache stores', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());

		expect(Array.from(database.objectStoreNames)).toEqual([
			'meta',
			'moduleBlobs',
			'moduleData',
			'state'
		]);
		database.close();
	});

	test('migrates v2 caches while deleting queues and resetting revision', async (): Promise<void> => {
		const name = databaseName();
		const legacy = await openDB(name, 2, {
			upgrade(database): void {
				database.createObjectStore('state', { keyPath: 'key' });
				database.createObjectStore('mutations', { keyPath: 'mutationId' });
				database.createObjectStore('moduleData', { keyPath: 'key' });
				database.createObjectStore('moduleBlobs', { keyPath: 'key' });
				database.createObjectStore('pendingUploads', { keyPath: 'id' });
				database.createObjectStore('meta', { keyPath: 'key' });
				database.createObjectStore('pendingApiCommands', { keyPath: 'id' });
				database.createObjectStore('apiCommandConflicts', { keyPath: 'id' });
			}
		});
		await legacy.put('state', {
			key: 'rule-book:game',
			value: { version: 1 },
			revision: 4,
			clientId: 'client-a',
			mutationId: 'mutation-a',
			updatedAt: '2026-09-14T00:00:00.000Z'
		});
		await legacy.put('moduleData', {
			key: 'shopping-list:snapshot:current',
			value: { items: [] },
			updatedAt: 1
		});
		await legacy.put('moduleBlobs', {
			key: 'map:normal',
			data: new Blob(['map']),
			metadata: { version: 1 },
			updatedAt: 1
		});
		await legacy.put('meta', { key: 'selectedDay', value: { dayIndex: 2 } });
		await legacy.put('meta', { key: 'serverRevision', value: 4 });
		await legacy.put('mutations', {
			mutationId: 'mutation-a',
			clientId: 'client-a',
			key: 'rule-book:game',
			value: { version: 1 },
			clientTimestamp: 1
		});
		await legacy.put('pendingApiCommands', {
			id: 'command-a',
			moduleId: 'shopping-list',
			path: '/api/shopping-list/items',
			method: 'POST',
			createdAt: 1,
			sequence: 1
		});
		legacy.close();

		const database = await openClientDatabase(name);

		expect(Array.from(database.objectStoreNames)).toEqual([
			'meta',
			'moduleBlobs',
			'moduleData',
			'state'
		]);
		expect((await database.get('state', 'rule-book:game'))?.value).toEqual({ version: 1 });
		expect((await database.get('moduleData', 'shopping-list:snapshot:current'))?.value).toEqual({
			items: []
		});
		expect(await (await database.get('moduleBlobs', 'map:normal'))?.data.text()).toBe('map');
		expect((await database.get('meta', 'selectedDay'))?.value).toEqual({ dayIndex: 2 });
		expect(await database.get('meta', 'serverRevision')).toBeUndefined();
		database.close();
	});
});
