import type { IDBPDatabase } from 'idb';

import { type ShoppingListSnapshot, shoppingListSnapshotSchema } from '$lib/trip/shoppinglist';

import { type GjemmekontorDatabase, openClientDatabase } from './database';

export async function storedShoppingListSnapshot(
	database?: IDBPDatabase<GjemmekontorDatabase>
): Promise<ShoppingListSnapshot | undefined> {
	const clientDatabase = database ?? (await openClientDatabase());
	const record = await clientDatabase.get('shoppingListSnapshot', 'current');
	const current = shoppingListSnapshotSchema.safeParse(record?.value);
	if (!database) {
		clientDatabase.close();
	}
	return current.success ? current.data : undefined;
}

export async function storeShoppingListSnapshot(
	snapshot: ShoppingListSnapshot,
	database?: IDBPDatabase<GjemmekontorDatabase>
): Promise<void> {
	const clientDatabase = database ?? (await openClientDatabase());
	await clientDatabase.put('shoppingListSnapshot', {
		id: 'current',
		value: snapshot,
		updatedAt: Date.now()
	});
	if (!database) {
		clientDatabase.close();
	}
}
