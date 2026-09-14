import { type DBSchema, type IDBPDatabase, openDB, unwrap } from 'idb';

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

export interface GjemmekontorDatabase extends DBSchema {
	state: { key: string; value: ClientStateEntry };
	moduleData: { key: string; value: ModuleDataRecord };
	moduleBlobs: { key: string; value: ModuleBlobRecord };
	meta: { key: string; value: MetaRecord };
}

export function tripClientDatabaseName(tripId: string): string {
	if (!tripId.trim()) {
		throw new Error('TRIP_ID_REQUIRED');
	}
	return `gjemmekontor-v0.2.0-trip-${tripId}`;
}

export function openClientDatabase(name: string): Promise<IDBPDatabase<GjemmekontorDatabase>> {
	return openDB<GjemmekontorDatabase>(name, 3, {
		upgrade(db, oldVersion, _newVersion, transaction): void {
			if (oldVersion < 1) {
				db.createObjectStore('state', { keyPath: 'key' });
				db.createObjectStore('moduleData', { keyPath: 'key' });
				db.createObjectStore('moduleBlobs', { keyPath: 'key' });
				db.createObjectStore('meta', { keyPath: 'key' });
			}
			if (oldVersion > 0 && oldVersion < 3) {
				const nativeDatabase = unwrap(db);
				for (const store of [
					'mutations',
					'pendingUploads',
					'pendingApiCommands',
					'apiCommandConflicts'
				]) {
					if (nativeDatabase.objectStoreNames.contains(store)) {
						nativeDatabase.deleteObjectStore(store);
					}
				}
				void transaction.objectStore('meta').delete('serverRevision');
			}
		}
	});
}

export function openTripClientDatabase(
	tripId: string
): Promise<IDBPDatabase<GjemmekontorDatabase>> {
	return openClientDatabase(tripClientDatabaseName(tripId));
}

export type ClientDatabaseSource = string | IDBPDatabase<GjemmekontorDatabase>;

export async function resolveClientDatabase(
	source: ClientDatabaseSource
): Promise<{ database: IDBPDatabase<GjemmekontorDatabase>; close: boolean }> {
	return typeof source === 'string'
		? { database: await openTripClientDatabase(source), close: true }
		: { database: source, close: false };
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
