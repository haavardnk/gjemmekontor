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
	sequence?: number;
};

export type ModuleDataRecord = {
	key: string;
	value: unknown;
	updatedAt: number;
};

export type ModuleBlobRecord = {
	key: string;
	data: Blob;
	metadata: JsonValue;
	updatedAt: number;
};

export type MetaRecord = {
	key: string;
	value: JsonValue;
};

export type PendingUpload = {
	id: string;
	moduleId: string;
	relatedStateKey: string;
	path: string;
	query: Record<string, string>;
	contentType: string;
	data: Blob;
	clientId: string;
	createdAt: number;
	expectedResponse: JsonValue;
};

export interface GjemmekontorDatabase extends DBSchema {
	state: { key: string; value: ClientStateEntry };
	mutations: { key: string; value: PendingMutation };
	moduleData: { key: string; value: ModuleDataRecord };
	moduleBlobs: { key: string; value: ModuleBlobRecord };
	pendingUploads: { key: string; value: PendingUpload };
	meta: { key: string; value: MetaRecord };
}

export const clientDatabaseName = 'gjemmekontor-data';

export function openClientDatabase(
	name = clientDatabaseName
): Promise<IDBPDatabase<GjemmekontorDatabase>> {
	return openDB<GjemmekontorDatabase>(name, 2, {
		upgrade(db, oldVersion): void {
			if (oldVersion < 1) {
				db.createObjectStore('state', { keyPath: 'key' });
				db.createObjectStore('mutations', { keyPath: 'mutationId' });
				db.createObjectStore('meta', { keyPath: 'key' });
			}
			if (oldVersion < 2) {
				db.createObjectStore('moduleData', { keyPath: 'key' });
				db.createObjectStore('moduleBlobs', { keyPath: 'key' });
				db.createObjectStore('pendingUploads', { keyPath: 'id' });
				const rawDatabase = db as unknown as IDBDatabase;
				for (const legacyStore of [
					'mapSnapshot',
					'offlineMap',
					'shoppingListSnapshot',
					'pendingGpxUploads'
				]) {
					if (rawDatabase.objectStoreNames.contains(legacyStore)) {
						rawDatabase.deleteObjectStore(legacyStore);
					}
				}
			}
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
