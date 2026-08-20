import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export type JsonValue =
	null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type ClientStateEntry = {
	key: string;
	value: JsonValue;
	revision: number;
	clientId: string;
	mutationId: string;
	updatedAt: string;
};

export type PendingMutation = {
	mutationId: string;
	clientId: string;
	key: string;
	value: JsonValue;
	clientTimestamp: number;
};

export type MapSnapshotRecord = {
	id: 'current';
	value: JsonValue;
	updatedAt: number;
};

export type OfflineMapRecord = {
	id: string;
	data: Blob;
	version: string;
	size: number;
	updatedAt: number;
};

export type MetaRecord = {
	key: string;
	value: JsonValue;
};

export interface GjemmekontorDatabase extends DBSchema {
	state: { key: string; value: ClientStateEntry };
	mutations: { key: string; value: PendingMutation };
	mapSnapshot: { key: string; value: MapSnapshotRecord };
	offlineMap: { key: string; value: OfflineMapRecord };
	meta: { key: string; value: MetaRecord };
}

export const clientDatabaseName = 'gjemmekontor';

export function openClientDatabase(
	name = clientDatabaseName
): Promise<IDBPDatabase<GjemmekontorDatabase>> {
	return openDB<GjemmekontorDatabase>(name, 1, {
		upgrade(db): void {
			db.createObjectStore('state', { keyPath: 'key' });
			db.createObjectStore('mutations', { keyPath: 'mutationId' });
			db.createObjectStore('mapSnapshot', { keyPath: 'id' });
			db.createObjectStore('offlineMap', { keyPath: 'id' });
			db.createObjectStore('meta', { keyPath: 'key' });
		}
	});
}

export async function getClientId(db: IDBPDatabase<GjemmekontorDatabase>): Promise<string> {
	const existing = await db.get('meta', 'clientId');
	if (typeof existing?.value === 'string') {
		return existing.value;
	}

	const clientId = crypto.randomUUID();
	await db.put('meta', { key: 'clientId', value: clientId });
	return clientId;
}
