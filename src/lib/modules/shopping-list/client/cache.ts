import { type ClientDatabaseSource, resolveClientDatabase } from '$lib/client/database';
import {
	type ShoppingListSnapshot,
	shoppingListSnapshotSchema
} from '$lib/modules/shopping-list/domain/shopping-list';

export const shoppingListSnapshotKey = 'shopping-list:snapshot:current';

export async function storedShoppingListSnapshot(
	source: ClientDatabaseSource
): Promise<ShoppingListSnapshot | undefined> {
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	const record = await clientDatabase.get('moduleData', shoppingListSnapshotKey);
	const current = shoppingListSnapshotSchema.safeParse(record?.value);
	if (close) {
		clientDatabase.close();
	}
	return current.success ? current.data : undefined;
}

export async function storeShoppingListSnapshot(
	source: ClientDatabaseSource,
	snapshot: ShoppingListSnapshot
): Promise<void> {
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	await clientDatabase.put('moduleData', {
		key: shoppingListSnapshotKey,
		value: snapshot,
		updatedAt: Date.now()
	});
	if (close) {
		clientDatabase.close();
	}
}
