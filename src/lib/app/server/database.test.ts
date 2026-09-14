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
			'next_trip_ratings',
			'next_trip_comments'
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

	test('opens the current schema without modifying its version', (): void => {
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
		database.exec(
			'DROP TABLE next_trip_comments; DROP TABLE next_trip_ratings; DROP TABLE next_trip_suggestions;'
		);
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

	test('preserves all version 5 Next Trip data', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-v5-');
		const database = createApplicationDatabase(dataDir);
		database.exec(`
			DROP TABLE next_trip_comments;
			DROP TABLE next_trip_ratings;
			DROP TABLE next_trip_suggestions;
			CREATE TABLE next_trip_suggestions (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				destination TEXT NOT NULL CHECK (length(trim(destination)) BETWEEN 1 AND 200),
				note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
				url TEXT NOT NULL DEFAULT '' CHECK (length(url) <= 2000),
				submitted_by_person_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
				updated_at TEXT NOT NULL DEFAULT '',
				UNIQUE (trip_id, id),
				FOREIGN KEY (trip_id, submitted_by_person_id)
					REFERENCES trip_members(trip_id, person_id)
			);
			CREATE INDEX next_trip_suggestions_trip
				ON next_trip_suggestions(trip_id, created_at);
			CREATE TABLE next_trip_ratings (
				trip_id TEXT NOT NULL,
				suggestion_id TEXT NOT NULL,
				person_id TEXT NOT NULL,
				score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, suggestion_id, person_id),
				FOREIGN KEY (trip_id, suggestion_id)
					REFERENCES next_trip_suggestions(trip_id, id) ON DELETE CASCADE,
				FOREIGN KEY (trip_id, person_id)
					REFERENCES trip_members(trip_id, person_id) ON DELETE CASCADE
			);
			CREATE INDEX next_trip_ratings_suggestion
				ON next_trip_ratings(trip_id, suggestion_id);
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

		expect(migrated.pragma('user_version', { simple: true })).toBe(7);
		expect(tables).not.toContain('next_trip_participation');
		expect(columns.map((column) => column.name)).not.toContain('active');
		expect(columns.map((column) => column.name)).toContain('updated_at');
		expect(
			migrated
				.prepare(
					`SELECT id, destination, created_at AS createdAt, updated_at AS updatedAt,
					        archived_at AS archivedAt
					 FROM next_trip_suggestions ORDER BY id`
				)
				.all()
		).toEqual([
			{
				id: 'suggestion-active',
				destination: 'Svalbard',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				archivedAt: null
			},
			{
				id: 'suggestion-archived',
				destination: 'Oslo',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				archivedAt: '2026-01-01T00:00:00.000Z'
			}
		]);
		expect(migrated.prepare('SELECT score FROM next_trip_ratings').get()).toEqual({ score: 5 });
		expect(migrated.pragma('foreign_key_check')).toEqual([]);
		migrated.close();
	});

	test('preserves version 6 suggestions and ratings exactly', (): void => {
		const dataDir = dataDirectory('gjemmekontor-app-v6-');
		const database = createApplicationDatabase(dataDir);
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
		database.exec(`
			DROP TABLE next_trip_comments;
			CREATE TABLE next_trip_suggestions_v6 (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				destination TEXT NOT NULL,
				note TEXT NOT NULL,
				url TEXT NOT NULL,
				submitted_by_person_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE (trip_id, id),
				FOREIGN KEY (trip_id, submitted_by_person_id)
					REFERENCES trip_members(trip_id, person_id)
			);
			INSERT INTO next_trip_suggestions_v6
			SELECT id, trip_id, destination, note, url, submitted_by_person_id, created_at
			FROM next_trip_suggestions;
			DROP TABLE next_trip_ratings;
			DROP TABLE next_trip_suggestions;
			ALTER TABLE next_trip_suggestions_v6 RENAME TO next_trip_suggestions;
			CREATE INDEX next_trip_suggestions_trip
				ON next_trip_suggestions(trip_id, created_at);
			CREATE TABLE next_trip_ratings (
				trip_id TEXT NOT NULL,
				suggestion_id TEXT NOT NULL,
				person_id TEXT NOT NULL,
				score INTEGER NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, suggestion_id, person_id),
				FOREIGN KEY (trip_id, suggestion_id)
					REFERENCES next_trip_suggestions(trip_id, id) ON DELETE CASCADE,
				FOREIGN KEY (trip_id, person_id)
					REFERENCES trip_members(trip_id, person_id) ON DELETE CASCADE
			);
			CREATE INDEX next_trip_ratings_suggestion
				ON next_trip_ratings(trip_id, suggestion_id);
		`);
		database
			.prepare(
				`INSERT INTO next_trip_suggestions
				 (id, trip_id, destination, note, url, submitted_by_person_id, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				'suggestion-1',
				'trip-1',
				'Svalbard',
				'Nordlys',
				'https://example.com',
				'person-1',
				'2026-02-03T04:05:06.000Z'
			);
		database
			.prepare(
				`INSERT INTO next_trip_ratings
				 (trip_id, suggestion_id, person_id, score, updated_at)
				 VALUES (?, ?, ?, ?, ?)`
			)
			.run('trip-1', 'suggestion-1', 'person-1', 4, '2026-02-04T04:05:06.000Z');
		database.pragma('user_version = 6');
		database.close();

		const migrated = createApplicationDatabase(dataDir);
		expect(
			migrated
				.prepare(
					`SELECT id, trip_id AS tripId, destination, note, url,
					        submitted_by_person_id AS submittedByPersonId, created_at AS createdAt,
					        updated_at AS updatedAt, archived_at AS archivedAt
					 FROM next_trip_suggestions`
				)
				.get()
		).toEqual({
			id: 'suggestion-1',
			tripId: 'trip-1',
			destination: 'Svalbard',
			note: 'Nordlys',
			url: 'https://example.com',
			submittedByPersonId: 'person-1',
			createdAt: '2026-02-03T04:05:06.000Z',
			updatedAt: '2026-02-03T04:05:06.000Z',
			archivedAt: null
		});
		expect(
			migrated
				.prepare(
					`SELECT trip_id AS tripId, suggestion_id AS suggestionId, person_id AS personId,
					        score, updated_at AS updatedAt FROM next_trip_ratings`
				)
				.get()
		).toEqual({
			tripId: 'trip-1',
			suggestionId: 'suggestion-1',
			personId: 'person-1',
			score: 4,
			updatedAt: '2026-02-04T04:05:06.000Z'
		});
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
