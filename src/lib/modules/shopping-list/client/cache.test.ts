import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test } from 'vitest';

import { openClientDatabase } from '$lib/client/database';
import type { ShoppingListSnapshot } from '$lib/modules/shopping-list/domain/shopping-list';

import { storedShoppingListSnapshot, storeShoppingListSnapshot } from './cache';

const databaseNames: string[] = [];

afterEach(async (): Promise<void> => {
	for (const name of databaseNames.splice(0)) {
		await deleteDB(name);
	}
});

function databaseName(): string {
	const name = `gjemmekontor-shoppinglist-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

const snapshot: ShoppingListSnapshot = {
	listUuid: 'trip-list',
	listName: 'Kroatia',
	items: [{ sourceName: 'Milch', name: 'Melk', specification: '2 liter' }],
	recentItems: [{ sourceName: 'Eier', name: 'Egg', specification: '' }],
	fetchedAt: '2026-08-21T10:00:00.000Z'
};

describe('shopping list cache', (): void => {
	test('stores and restores the current Bring snapshot', async (): Promise<void> => {
		const database = await openClientDatabase(databaseName());

		await storeShoppingListSnapshot(snapshot, database);

		expect(await storedShoppingListSnapshot(database)).toEqual(snapshot);
		database.close();
	});
});
