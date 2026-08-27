import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import type { MapRuntimeConfig } from './config';
import { handleOfflineMapFile, offlineMapManifest } from './offline';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createApplicationDatabase>> = [];
const archive = new Uint8Array([80, 77, 84, 105, 108, 101, 115, 3, 1, 2, 3, 4]);
const tripId = '0b558eed-f173-4cb3-aa50-f8ff5d15fb15';

afterEach(async (): Promise<void> => {
	for (const db of databases.splice(0)) db.close();
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture(): Promise<{
	config: MapRuntimeConfig;
	db: ReturnType<typeof createApplicationDatabase>;
	directory: string;
	bundledDirectory: string;
}> {
	const directory = await mkdtemp(join(tmpdir(), 'gjemmekontor-offline-map-'));
	directories.push(directory);
	const bundledDirectory = join(directory, 'bundled');
	const config: MapRuntimeConfig = {
		aisStreamApiKey: 'ais-key',
		dataDir: directory,
		bundledOfflineMapDir: bundledDirectory,
		tripadvisorTerraPhotosEnabled: false,
		tripadvisorCacheDays: 30
	};
	const db = createApplicationDatabase(directory);
	databases.push(db);
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, 'offline-trip', 'Offline trip', 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	).run(tripId, '2026-08-27', '2026-08-27');
	db.prepare(
		`INSERT INTO trip_modules
		 (trip_id, module_id, enabled, position, config_version, config_json, configured_at, updated_at)
		 VALUES (?, 'map', 1, 0, 1, ?, ?, ?)`
	).run(
		tripId,
		JSON.stringify({
			googleMyMapsId: 'map-id',
			defaultMode: 'normal',
			enabledOverlays: [],
			offlinePackages: ['normal', 'nautical', 'satellite']
		}),
		'2026-08-27',
		'2026-08-27'
	);
	await mkdir(join(directory, 'trips', tripId, 'map', 'offline'), { recursive: true });
	await mkdir(bundledDirectory, { recursive: true });
	return { config, db, directory, bundledDirectory };
}

describe('offline map packages', (): void => {
	test("does not expose one trip's persistent package to another trip", async (): Promise<void> => {
		const { config, db, directory } = await fixture();
		const secondTripId = '8c9e79ce-08ac-4107-9268-a98b5aab5a98';
		db.prepare(
			`INSERT INTO trips
			 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
			 VALUES (?, 'other-offline-trip', 'Other trip', 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
		).run(secondTripId, '2026-08-27', '2026-08-27');
		db.prepare(
			`INSERT INTO trip_modules
			 (trip_id, module_id, enabled, position, config_version, config_json, configured_at, updated_at)
			 VALUES (?, 'map', 1, 0, 1, ?, ?, ?)`
		).run(
			secondTripId,
			JSON.stringify({
				googleMyMapsId: 'other-map-id',
				defaultMode: 'normal',
				enabledOverlays: [],
				offlinePackages: ['normal']
			}),
			'2026-08-27',
			'2026-08-27'
		);
		await writeFile(join(directory, 'trips', tripId, 'map', 'offline', 'normal.pmtiles'), archive);

		expect((await offlineMapManifest(tripId, db, config)).packages).toHaveLength(1);
		expect((await offlineMapManifest(secondTripId, db, config)).packages).toEqual([]);
	});

	test('lists mounted non-empty packages', async (): Promise<void> => {
		const { config, db, directory } = await fixture();
		await writeFile(join(directory, 'trips', tripId, 'map', 'offline', 'normal.pmtiles'), archive);
		await writeFile(
			join(directory, 'trips', tripId, 'map', 'offline', 'satellite.pmtiles'),
			new Uint8Array()
		);

		const manifest = await offlineMapManifest(tripId, db, config);

		expect(manifest.packages).toHaveLength(1);
		expect(manifest.packages[0]).toMatchObject({
			mode: 'normal',
			name: 'Vanlig kart',
			size: archive.byteLength,
			url: '/api/map/offline/normal'
		});
	});

	test('falls back to bundled packages and prefers persistent overrides', async (): Promise<void> => {
		const { config, db, directory, bundledDirectory } = await fixture();
		await writeFile(join(bundledDirectory, 'normal.pmtiles'), archive);

		const bundled = await offlineMapManifest(tripId, db, config);
		const bundledFile = await handleOfflineMapFile(
			tripId,
			'normal',
			new Request('https://example.com/api/map/offline/normal'),
			db,
			config
		);
		await writeFile(
			join(directory, 'trips', tripId, 'map', 'offline', 'normal.pmtiles'),
			new Uint8Array([...archive, 5])
		);
		const overridden = await offlineMapManifest(tripId, db, config);

		expect(bundled.packages[0]?.size).toBe(archive.byteLength);
		expect(new Uint8Array(await bundledFile.arrayBuffer())).toEqual(archive);
		expect(overridden.packages[0]?.size).toBe(archive.byteLength + 1);
	});

	test('streams complete and ranged package responses', async (): Promise<void> => {
		const { config, db, directory } = await fixture();
		await writeFile(
			join(directory, 'trips', tripId, 'map', 'offline', 'nautical.pmtiles'),
			archive
		);

		const complete = await handleOfflineMapFile(
			tripId,
			'nautical',
			new Request('https://example.com/api/map/offline/nautical'),
			db,
			config
		);
		const partial = await handleOfflineMapFile(
			tripId,
			'nautical',
			new Request('https://example.com/api/map/offline/nautical', {
				headers: { range: 'bytes=1-2' }
			}),
			db,
			config
		);

		expect(complete.status).toBe(200);
		expect(new Uint8Array(await complete.arrayBuffer())).toEqual(archive);
		expect(partial.status).toBe(206);
		expect(partial.headers.get('content-range')).toBe(`bytes 1-2/${archive.byteLength}`);
		expect(new Uint8Array(await partial.arrayBuffer())).toEqual(archive.slice(1, 3));
	});

	test('rejects invalid and unsatisfiable requests', async (): Promise<void> => {
		const { config, db, directory } = await fixture();
		await writeFile(join(directory, 'trips', tripId, 'map', 'offline', 'normal.pmtiles'), archive);

		const missing = await handleOfflineMapFile(
			tripId,
			'other',
			new Request('https://example.com/api/map/offline/other'),
			db,
			config
		);
		const invalidRange = await handleOfflineMapFile(
			tripId,
			'normal',
			new Request('https://example.com/api/map/offline/normal', {
				headers: { range: 'bytes=15-19' }
			}),
			db,
			config
		);

		expect(missing.status).toBe(404);
		expect(invalidRange.status).toBe(416);
	});
});
