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

export type PendingApiCommand = {
	id: string;
	moduleId: string;
	path: string;
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	body?: JsonValue;
	createdAt: number;
	sequence: number;
};

export type ApiCommandConflict = PendingApiCommand & {
	status: number;
	code: string;
	failedAt: number;
};

export interface GjemmekontorDatabase extends DBSchema {
	state: { key: string; value: ClientStateEntry };
	mutations: { key: string; value: PendingMutation };
	moduleData: { key: string; value: ModuleDataRecord };
	moduleBlobs: { key: string; value: ModuleBlobRecord };
	pendingUploads: { key: string; value: PendingUpload };
	pendingApiCommands: { key: string; value: PendingApiCommand };
	apiCommandConflicts: { key: string; value: ApiCommandConflict };
	meta: { key: string; value: MetaRecord };
}

export function tripClientDatabaseName(tripId: string): string {
	if (!tripId.trim()) {
		throw new Error('TRIP_ID_REQUIRED');
	}
	return `gjemmekontor-v0.2.0-trip-${tripId}`;
}

export function openClientDatabase(name: string): Promise<IDBPDatabase<GjemmekontorDatabase>> {
	return openDB<GjemmekontorDatabase>(name, 2, {
		upgrade(db, oldVersion): void {
			if (oldVersion < 1) {
				db.createObjectStore('state', { keyPath: 'key' });
				db.createObjectStore('mutations', { keyPath: 'mutationId' });
				db.createObjectStore('moduleData', { keyPath: 'key' });
				db.createObjectStore('moduleBlobs', { keyPath: 'key' });
				db.createObjectStore('pendingUploads', { keyPath: 'id' });
				db.createObjectStore('meta', { keyPath: 'key' });
			}
			if (oldVersion < 2) {
				db.createObjectStore('pendingApiCommands', { keyPath: 'id' });
				db.createObjectStore('apiCommandConflicts', { keyPath: 'id' });
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
