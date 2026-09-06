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
			'trip_gear_packing',
			'next_trip_suggestions',
			'next_trip_ratings'
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
		expect(reopened.pragma('user_version', { simple: true })).toBe(
			applicationDatabaseSchema.version
		);
		expect(reopened.pragma('foreign_key_check')).toEqual([]);
		reopened.close();
	});

	test('migrates the released schema with Next Trip tables', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-migrate-');
		const database = createApplicationDatabase(dataDir);
		database.exec('DROP TABLE next_trip_ratings; DROP TABLE next_trip_suggestions;');
		database.pragma('user_version = 4');
		database.close();

		const migrated = createApplicationDatabase(dataDir);
		const tables = migrated
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all()
			.map((row) => (row as { name: string }).name);

		expect(migrated.pragma('user_version', { simple: true })).toBe(
			applicationDatabaseSchema.version
		);
		expect(tables).toContain('next_trip_suggestions');
		expect(tables).toContain('next_trip_ratings');
		migrated.close();
	});

	test('migrates version 5 Next Trip data to the compact schema', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-v5-');
		const database = createApplicationDatabase(dataDir);
		database.exec(`
			ALTER TABLE next_trip_suggestions
				ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
			ALTER TABLE next_trip_suggestions
				ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
			CREATE TABLE next_trip_participation (
				trip_id TEXT NOT NULL,
				person_id TEXT NOT NULL,
				participating INTEGER NOT NULL CHECK (participating IN (0, 1)),
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, person_id),
				FOREIGN KEY (trip_id, person_id)
					REFERENCES trip_members(trip_id, person_id) ON DELETE CASCADE
			);
		`);
		database
			.prepare(
				`INSERT INTO trips
				 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
				 VALUES (?, ?, ?, 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
			)
			.run('trip-1', 'trip-1', 'Trip 1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
		database
			.prepare('INSERT INTO people (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
			.run('person-1', 'Ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
		database
			.prepare(
				`INSERT INTO trip_members
				 (trip_id, person_id, active, sort_order, joined_at, removed_at)
				 VALUES (?, ?, 1, 0, ?, NULL)`
			)
			.run('trip-1', 'person-1', '2026-01-01T00:00:00.000Z');
		const insertSuggestion = database.prepare(
			`INSERT INTO next_trip_suggestions
			 (id, trip_id, destination, note, url, submitted_by_person_id, created_at, active, updated_at)
			 VALUES (?, 'trip-1', ?, '', '', 'person-1', ?, ?, ?)`
		);
		insertSuggestion.run(
			'suggestion-active',
			'Svalbard',
			'2026-01-01T00:00:00.000Z',
			1,
			'2026-01-01T00:00:00.000Z'
		);
		insertSuggestion.run(
			'suggestion-archived',
			'Oslo',
			'2026-01-01T00:00:00.000Z',
			0,
			'2026-01-01T00:00:00.000Z'
		);
		database
			.prepare(
				`INSERT INTO next_trip_ratings
				 (trip_id, suggestion_id, person_id, score, updated_at)
				 VALUES ('trip-1', 'suggestion-active', 'person-1', 5, ?)`
			)
			.run('2026-01-01T00:00:00.000Z');
		database.pragma('user_version = 5');
		database.close();

		const migrated = createApplicationDatabase(dataDir);
		const tables = migrated
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all()
			.map((row) => (row as { name: string }).name);
		const columns = migrated.pragma('table_info(next_trip_suggestions)') as Array<{
			name: string;
		}>;

		expect(migrated.pragma('user_version', { simple: true })).toBe(6);
		expect(tables).not.toContain('next_trip_participation');
		expect(columns.map((column) => column.name)).not.toContain('active');
		expect(columns.map((column) => column.name)).not.toContain('updated_at');
		expect(migrated.prepare('SELECT id FROM next_trip_suggestions ORDER BY id').all()).toEqual([
			{ id: 'suggestion-active' }
		]);
		expect(migrated.prepare('SELECT score FROM next_trip_ratings').get()).toEqual({ score: 5 });
		expect(migrated.pragma('foreign_key_check')).toEqual([]);
		migrated.close();
	});

	test('rejects incomplete database versions', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-unsupported-');
		const database = new Database(join(dataDir, 'gjemmekontor.sqlite'));
		database.pragma('user_version = 3');
		database.close();

		expect(() => createApplicationDatabase(dataDir)).toThrow('DATABASE_VERSION_UNSUPPORTED');
	});
});
