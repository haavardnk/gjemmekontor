import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createDatabase } from './database';

const temporaryDirectories: string[] = [];

afterEach((): void => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('database migration', (): void => {
	test('creates the schema and configures SQLite idempotently', (): void => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-'));
		temporaryDirectories.push(dataDir);

		const first = createDatabase(dataDir);
		const tables = first
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);

		expect(tables).toEqual(['gpx_uploads', 'meta', 'sessions', 'state_entries']);
		expect(first.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(first.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(first.pragma('busy_timeout', { simple: true })).toBe(5000);
		expect(first.pragma('synchronous', { simple: true })).toBe(1);
		expect(first.pragma('user_version', { simple: true })).toBe(2);
		first.close();

		const second = createDatabase(dataDir);
		const revision = second
			.prepare("SELECT value FROM meta WHERE key = 'global_revision'")
			.get() as { value: string };
		expect(revision.value).toBe('0');
		expect(second.pragma('user_version', { simple: true })).toBe(2);
		second.close();
	});
});
