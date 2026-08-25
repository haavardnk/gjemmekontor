import type { IDBPDatabase } from 'idb';

import { type GjemmekontorDatabase, openClientDatabase } from '$lib/client/database';
import {
	type ShoppingListSnapshot,
	shoppingListSnapshotSchema
} from '$lib/modules/shopping-list/domain/shopping-list';

const snapshotKey = 'shopping-list:snapshot:current';

export async function storedShoppingListSnapshot(
	database?: IDBPDatabase<GjemmekontorDatabase>
): Promise<ShoppingListSnapshot | undefined> {
	const clientDatabase = database ?? (await openClientDatabase());
	const record = await clientDatabase.get('moduleData', snapshotKey);
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
	await clientDatabase.put('moduleData', {
		key: snapshotKey,
		value: snapshot,
		updatedAt: Date.now()
	});
	if (!database) {
		clientDatabase.close();
	}
}
