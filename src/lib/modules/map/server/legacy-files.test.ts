import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { migrateLegacyMapFiles } from './legacy-files';

const directories: string[] = [];
const tripId = '82a8d607-acc9-4c50-a948-463e6a34ef25';

afterEach((): void => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
	const result = mkdtempSync(join(tmpdir(), 'gjemmekontor-map-files-'));
	directories.push(result);
	return result;
}

describe('legacy map file migration', (): void => {
	test('copies every byte into the trip directory before removing the old path', (): void => {
		const dataDir = directory();
		mkdirSync(join(dataDir, 'map', 'offline'), { recursive: true });
		writeFileSync(join(dataDir, 'map', 'snapshot.json'), Buffer.from([0, 1, 2, 3, 255]));
		writeFileSync(
			join(dataDir, 'map', 'offline', 'normal.pmtiles'),
			Buffer.from('PMTiles\x03data')
		);

		migrateLegacyMapFiles(dataDir, tripId);

		const target = join(dataDir, 'trips', tripId, 'map');
		expect(existsSync(join(dataDir, 'map'))).toBe(false);
		expect(readFileSync(join(target, 'snapshot.json'))).toEqual(Buffer.from([0, 1, 2, 3, 255]));
		expect(readFileSync(join(target, 'offline', 'normal.pmtiles'))).toEqual(
			Buffer.from('PMTiles\x03data')
		);
	});

	test('finishes an interrupted identical copy without overwriting differences', (): void => {
		const dataDir = directory();
		const source = join(dataDir, 'map');
		const target = join(dataDir, 'trips', tripId, 'map');
		mkdirSync(source, { recursive: true });
		mkdirSync(target, { recursive: true });
		writeFileSync(join(source, 'snapshot.json'), 'source');
		writeFileSync(join(target, 'snapshot.json'), 'different');

		expect(() => migrateLegacyMapFiles(dataDir, tripId)).toThrow('MAP_FILE_IMPORT_CONFLICT');
		expect(readFileSync(join(source, 'snapshot.json'), 'utf8')).toBe('source');
		expect(readFileSync(join(target, 'snapshot.json'), 'utf8')).toBe('different');

		writeFileSync(join(target, 'snapshot.json'), 'source');
		migrateLegacyMapFiles(dataDir, tripId);
		expect(existsSync(source)).toBe(false);
	});
});
