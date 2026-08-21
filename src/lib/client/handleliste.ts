import type { IDBPDatabase } from 'idb';

import { type HandlelisteSnapshot, handlelisteSnapshotSchema } from '$lib/trip/handleliste';

import { type GjemmekontorDatabase, openClientDatabase } from './database';

export async function storedHandlelisteSnapshot(
	database?: IDBPDatabase<GjemmekontorDatabase>
): Promise<HandlelisteSnapshot | undefined> {
	const clientDatabase = database ?? (await openClientDatabase());
	const record = await clientDatabase.get('handlelisteSnapshot', 'current');
	const current = handlelisteSnapshotSchema.safeParse(record?.value);
	if (!database) {
		clientDatabase.close();
	}
	return current.success ? current.data : undefined;
}

export async function storeHandlelisteSnapshot(
	snapshot: HandlelisteSnapshot,
	database?: IDBPDatabase<GjemmekontorDatabase>
): Promise<void> {
	const clientDatabase = database ?? (await openClientDatabase());
	await clientDatabase.put('handlelisteSnapshot', {
		id: 'current',
		value: snapshot,
		updatedAt: Date.now()
	});
	if (!database) {
		clientDatabase.close();
	}
}
