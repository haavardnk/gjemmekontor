import { type ClientDatabaseSource, resolveClientDatabase } from '$lib/client/database';

import {
	isCurrentMapSnapshot,
	type MapMode,
	type MapSnapshot,
	type OfflineMapPackage
} from '../domain/types';

export type OfflineMapProgress = {
	received: number;
	total: number;
};

export type MapSnapshotRecord = {
	id: 'current';
	value: MapSnapshot;
	updatedAt: number;
};

export type OfflineMapRecord = {
	id: MapMode;
	data: Blob;
	version: string;
	size: number;
	updatedAt: number;
};

export const mapSnapshotKey = 'map:snapshot:current';
const offlineMapPrefix = 'map:offline:';

export async function storedMapSnapshot(
	source: ClientDatabaseSource
): Promise<MapSnapshotRecord | undefined> {
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	const record = await clientDatabase.get('moduleData', mapSnapshotKey);
	if (close) {
		clientDatabase.close();
	}
	return isCurrentMapSnapshot(record?.value)
		? { id: 'current', value: record.value, updatedAt: record.updatedAt }
		: undefined;
}

export async function storeMapSnapshot(
	source: ClientDatabaseSource,
	snapshot: MapSnapshot
): Promise<void> {
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	await clientDatabase.put('moduleData', {
		key: mapSnapshotKey,
		value: snapshot,
		updatedAt: Date.now()
	});
	if (close) {
		clientDatabase.close();
	}
}

export async function storedOfflineMaps(source: ClientDatabaseSource): Promise<OfflineMapRecord[]> {
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	const records = (await clientDatabase.getAll('moduleBlobs')).flatMap((record) => {
		if (
			!record.key.startsWith(offlineMapPrefix) ||
			!record.metadata ||
			typeof record.metadata !== 'object' ||
			Array.isArray(record.metadata)
		) {
			return [];
		}
		const id = record.key.slice(offlineMapPrefix.length);
		const version = record.metadata.version;
		const size = record.metadata.size;
		if (
			(id !== 'normal' && id !== 'nautical' && id !== 'satellite') ||
			typeof version !== 'string' ||
			typeof size !== 'number'
		) {
			return [];
		}
		return [{ id: id as MapMode, data: record.data, version, size, updatedAt: record.updatedAt }];
	});
	if (close) {
		clientDatabase.close();
	}
	return records;
}

export async function removeOfflineMap(source: ClientDatabaseSource, mode: MapMode): Promise<void> {
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	await clientDatabase.delete('moduleBlobs', `${offlineMapPrefix}${mode}`);
	if (close) {
		clientDatabase.close();
	}
}

export async function downloadOfflineMap(
	source: ClientDatabaseSource,
	mapPackage: OfflineMapPackage,
	onProgress: (progress: OfflineMapProgress) => void,
	fetcher: typeof fetch = fetch
): Promise<OfflineMapRecord> {
	const response = await fetcher(mapPackage.url);
	if (!response.ok || !response.body) {
		throw new Error('OFFLINE_MAP_DOWNLOAD_FAILED');
	}

	const reader = response.body.getReader();
	const chunks: ArrayBuffer[] = [];
	let received = 0;
	while (true) {
		const result = await reader.read();
		if (result.done) {
			break;
		}
		chunks.push(new Uint8Array(result.value).buffer);
		received += result.value.byteLength;
		onProgress({ received, total: mapPackage.size });
	}

	if (received !== mapPackage.size) {
		throw new Error('OFFLINE_MAP_SIZE_MISMATCH');
	}
	const data = new Blob(chunks, { type: 'application/vnd.pmtiles' });
	const signature = new Uint8Array(await data.slice(0, 8).arrayBuffer());
	if (new TextDecoder().decode(signature.slice(0, 7)) !== 'PMTiles' || signature[7] !== 3) {
		throw new Error('OFFLINE_MAP_INVALID');
	}

	const record: OfflineMapRecord = {
		id: mapPackage.mode,
		data,
		version: mapPackage.version,
		size: received,
		updatedAt: Date.now()
	};
	const { database, close } = await resolveClientDatabase(source);
	const clientDatabase = database;
	await clientDatabase.put('moduleBlobs', {
		key: `${offlineMapPrefix}${record.id}`,
		data: record.data,
		metadata: { version: record.version, size: record.size },
		updatedAt: record.updatedAt
	});
	if (close) {
		clientDatabase.close();
	}
	return record;
}
