import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from './database';

const temporaryDirectories: string[] = [];

afterEach((): void => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('application database composition', (): void => {
	test('includes migrations from bundled modules even when activation is separate', (): void => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-app-'));
		temporaryDirectories.push(dataDir);
		const database = createApplicationDatabase(dataDir);
		const tables = database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);

		expect(tables).toEqual(['gpx_uploads', 'meta', 'sessions', 'state_entries']);
		expect(database.pragma('user_version', { simple: true })).toBe(1);
		database.close();
	});
});
