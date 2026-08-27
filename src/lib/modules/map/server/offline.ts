import { createReadStream, type Stats } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import type Database from 'better-sqlite3';

import { getDatabase } from '$lib/app/server/database';
import type { MapMode, OfflineMapManifest, OfflineMapPackage } from '$lib/modules/map/domain/types';
import { apiError, apiSuccess } from '$lib/server/api';

import { getMapRuntimeConfig, loadTripMapConfig, type MapRuntimeConfig } from './config';

const packageNames: Record<MapMode, string> = {
	normal: 'Vanlig kart',
	nautical: 'Sjøkart',
	satellite: 'Satellittkart'
};

type AvailablePackage = {
	path: string;
	file: Stats;
};

function packagePaths(config: MapRuntimeConfig, tripId: string, mode: MapMode): string[] {
	const filename = `${mode}.pmtiles`;
	return [
		join(config.dataDir, 'trips', tripId, 'map', 'offline', filename),
		...(config.bundledOfflineMapDir ? [join(config.bundledOfflineMapDir, filename)] : [])
	];
}

async function validPackage(path: string): Promise<boolean> {
	const file = await open(path, 'r');
	try {
		const signature = new Uint8Array(8);
		const result = await file.read(signature, 0, signature.byteLength, 0);
		return (
			result.bytesRead === signature.byteLength &&
			new TextDecoder().decode(signature.slice(0, 7)) === 'PMTiles' &&
			signature[7] === 3
		);
	} finally {
		await file.close();
	}
}

export function isMapMode(value: string): value is MapMode {
	return value === 'normal' || value === 'nautical' || value === 'satellite';
}

async function availablePackage(
	config: MapRuntimeConfig,
	tripId: string,
	mode: MapMode
): Promise<AvailablePackage | undefined> {
	for (const path of packagePaths(config, tripId, mode)) {
		try {
			const file = await stat(path);
			if (file.isFile() && (await validPackage(path))) {
				return { path, file };
			}
		} catch {
			continue;
		}
	}
	return undefined;
}

export async function offlineMapManifest(
	tripId: string,
	db: Database.Database = getDatabase(),
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<OfflineMapManifest> {
	const allowed = new Set(loadTripMapConfig(db, tripId).offlinePackages);
	const packages = await Promise.all(
		(Object.keys(packageNames) as MapMode[]).map(
			async (mode): Promise<OfflineMapPackage | undefined> => {
				if (!allowed.has(mode)) return undefined;
				const available = await availablePackage(config, tripId, mode);
				if (!available) {
					return undefined;
				}
				return {
					mode,
					name: packageNames[mode],
					version: `${available.file.size}-${Math.trunc(available.file.mtimeMs)}`,
					size: available.file.size,
					url: `/api/map/offline/${mode}`
				};
			}
		)
	);
	return { packages: packages.filter((item) => item !== undefined) };
}

export async function handleOfflineMapManifest(
	tripId: string,
	db?: Database.Database,
	config?: MapRuntimeConfig
): Promise<Response> {
	return apiSuccess(await offlineMapManifest(tripId, db, config));
}

export async function handleOfflineMapFile(
	tripId: string,
	mode: string,
	request: Request,
	db: Database.Database = getDatabase(),
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<Response> {
	if (!isMapMode(mode)) {
		return apiError('OFFLINE_MAP_NOT_FOUND', 404);
	}

	if (!loadTripMapConfig(db, tripId).offlinePackages.includes(mode)) {
		return apiError('OFFLINE_MAP_NOT_FOUND', 404);
	}
	const available = await availablePackage(config, tripId, mode);
	if (!available) {
		return apiError('OFFLINE_MAP_NOT_FOUND', 404);
	}
	const { file, path } = available;

	const range = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/);
	const start = range ? Number(range[1]) : 0;
	const requestedEnd = range?.[2] ? Number(range[2]) : file.size - 1;
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(requestedEnd) ||
		start > requestedEnd ||
		start >= file.size
	) {
		return new Response(null, {
			status: 416,
			headers: { 'Content-Range': `bytes */${file.size}` }
		});
	}
	const end = Math.min(requestedEnd, file.size - 1);
	const stream = createReadStream(path, { start, end });
	const headers = new Headers({
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'private, max-age=31536000, immutable',
		'Content-Length': String(end - start + 1),
		'Content-Type': 'application/vnd.pmtiles',
		ETag: `"${file.size}-${Math.trunc(file.mtimeMs)}"`
	});
	if (range) {
		headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
	}
	return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
		status: range ? 206 : 200,
		headers
	});
}
