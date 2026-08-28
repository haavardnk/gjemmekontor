import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';

import { applicationDatabaseSchema, createApplicationDatabase } from './database';

const temporaryDirectories: string[] = [];

afterEach((): void => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function dataDirectory(label: string): string {
	const directory = mkdtempSync(join(tmpdir(), label));
	temporaryDirectories.push(directory);
	return directory;
}

describe('application database', (): void => {
	test('creates only the current trip-based schema', (): void => {
		const database = createApplicationDatabase(dataDirectory('gjemmekontor-app-'));
		const tables = database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);

		for (const table of [
			'auth_login_attempts',
			'sessions',
			'trips',
			'trip_credentials',
			'people',
			'trip_members',
			'trip_days',
			'trip_modules',
			'session_trip_grants',
			'session_admin_grants',
			'trip_state_entries',
			'trip_revisions',
			'trip_mutation_receipts',
			'trip_gpx_uploads',
			'trip_poi_provider_mappings',
			'trip_poi_enrichment_cache',
			'shot_content_packs',
			'trip_shot_content',
			'recipes',
			'recipe_versions',
			'trip_menu_entries',
			'gear_items',
			'gear_item_owners',
			'trip_gear_items',
			'trip_gear_packing'
		]) {
			expect(tables, table).toContain(table);
		}
		expect(tables).not.toContain('state_entries');
		expect(tables).not.toContain('gpx_uploads');
		expect(tables).not.toContain('poi_provider_mappings');
		expect(tables).not.toContain('poi_enrichment_cache');
		expect(database.pragma('foreign_key_check')).toEqual([]);
		expect(database.pragma('user_version', { simple: true })).toBe(
			applicationDatabaseSchema.version
		);
		database.close();
	});

	test('opens the released schema without modifying its version', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-existing-');
		const first = createApplicationDatabase(dataDir);
		first.close();

		const reopened = createApplicationDatabase(dataDir);
		expect(reopened.pragma('user_version', { simple: true })).toBe(4);
		expect(reopened.pragma('foreign_key_check')).toEqual([]);
		reopened.close();
	});

	test('rejects incomplete database versions', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-unsupported-');
		const database = new Database(join(dataDir, 'gjemmekontor.sqlite'));
		database.pragma('user_version = 3');
		database.close();

		expect(() => createApplicationDatabase(dataDir)).toThrow('DATABASE_VERSION_UNSUPPORTED');
	});
});
