import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import type { MapRuntimeConfig } from './config';
import { handleOfflineMapFile, offlineMapManifest } from './offline';

const directories: string[] = [];
const archive = new Uint8Array([80, 77, 84, 105, 108, 101, 115, 3, 1, 2, 3, 4]);

afterEach(async (): Promise<void> => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture(): Promise<{
	config: MapRuntimeConfig;
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
		googleMyMapsId: 'map-id'
	};
	await mkdir(join(directory, 'map', 'offline'), { recursive: true });
	await mkdir(bundledDirectory, { recursive: true });
	return { config, directory, bundledDirectory };
}

describe('offline map packages', (): void => {
	test('lists mounted non-empty packages', async (): Promise<void> => {
		const { config, directory } = await fixture();
		await writeFile(join(directory, 'map', 'offline', 'normal.pmtiles'), archive);
		await writeFile(join(directory, 'map', 'offline', 'satellite.pmtiles'), new Uint8Array());

		const manifest = await offlineMapManifest(config);

		expect(manifest.packages).toHaveLength(1);
		expect(manifest.packages[0]).toMatchObject({
			mode: 'normal',
			name: 'Vanlig kart',
			size: archive.byteLength,
			url: '/api/map/offline/normal'
		});
	});

	test('falls back to bundled packages and prefers persistent overrides', async (): Promise<void> => {
		const { config, directory, bundledDirectory } = await fixture();
		await writeFile(join(bundledDirectory, 'normal.pmtiles'), archive);

		const bundled = await offlineMapManifest(config);
		const bundledFile = await handleOfflineMapFile(
			'normal',
			new Request('https://example.com/api/map/offline/normal'),
			config
		);
		await writeFile(
			join(directory, 'map', 'offline', 'normal.pmtiles'),
			new Uint8Array([...archive, 5])
		);
		const overridden = await offlineMapManifest(config);

		expect(bundled.packages[0]?.size).toBe(archive.byteLength);
		expect(new Uint8Array(await bundledFile.arrayBuffer())).toEqual(archive);
		expect(overridden.packages[0]?.size).toBe(archive.byteLength + 1);
	});

	test('streams complete and ranged package responses', async (): Promise<void> => {
		const { config, directory } = await fixture();
		await writeFile(join(directory, 'map', 'offline', 'nautical.pmtiles'), archive);

		const complete = await handleOfflineMapFile(
			'nautical',
			new Request('https://example.com/api/map/offline/nautical'),
			config
		);
		const partial = await handleOfflineMapFile(
			'nautical',
			new Request('https://example.com/api/map/offline/nautical', {
				headers: { range: 'bytes=1-2' }
			}),
			config
		);

		expect(complete.status).toBe(200);
		expect(new Uint8Array(await complete.arrayBuffer())).toEqual(archive);
		expect(partial.status).toBe(206);
		expect(partial.headers.get('content-range')).toBe(`bytes 1-2/${archive.byteLength}`);
		expect(new Uint8Array(await partial.arrayBuffer())).toEqual(archive.slice(1, 3));
	});

	test('rejects invalid and unsatisfiable requests', async (): Promise<void> => {
		const { config, directory } = await fixture();
		await writeFile(join(directory, 'map', 'offline', 'normal.pmtiles'), archive);

		const missing = await handleOfflineMapFile(
			'other',
			new Request('https://example.com/api/map/offline/other'),
			config
		);
		const invalidRange = await handleOfflineMapFile(
			'normal',
			new Request('https://example.com/api/map/offline/normal', {
				headers: { range: 'bytes=15-19' }
			}),
			config
		);

		expect(missing.status).toBe(404);
		expect(invalidRange.status).toBe(416);
	});
});
