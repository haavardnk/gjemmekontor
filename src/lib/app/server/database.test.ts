import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createDatabase } from '$lib/server/database';

import {
	applicationDatabaseMigrations,
	createApplicationDatabase,
	initializeApplicationDatabase
} from './database';

const temporaryDirectories: string[] = [];

afterEach((): void => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('application database composition', (): void => {
	test('removes conversion-only tables after initialization', (): void => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-app-final-'));
		temporaryDirectories.push(dataDir);
		const database = initializeApplicationDatabase(dataDir);
		const tables = database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);

		for (const removed of [
			'gpx_uploads',
			'poi_enrichment_cache',
			'poi_provider_mappings',
			'state_entries'
		]) {
			expect(tables).not.toContain(removed);
		}
		for (const current of ['trips', 'trip_state_entries', 'trip_gpx_uploads']) {
			expect(tables).toContain(current);
		}
		expect(database.pragma('foreign_key_check')).toEqual([]);
		database.close();
	});

	test('includes migrations from bundled modules even when activation is separate', (): void => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-app-'));
		temporaryDirectories.push(dataDir);
		const database = createApplicationDatabase(dataDir);
		const tables = database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);

		for (const table of [
			'auth_login_attempts',
			'gpx_uploads',
			'poi_enrichment_cache',
			'poi_provider_mappings',
			'sessions',
			'state_entries',
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
		expect(database.pragma('foreign_key_check')).toEqual([]);
		expect(database.pragma('user_version', { simple: true })).toBe(4);
		database.close();
	});

	test('upgrades a version 1 application database with provider cache tables', (): void => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-app-upgrade-'));
		temporaryDirectories.push(dataDir);
		const versionOne = createDatabase(dataDir, applicationDatabaseMigrations.slice(0, 1));
		expect(versionOne.pragma('user_version', { simple: true })).toBe(1);
		versionOne.close();

		const upgraded = createApplicationDatabase(dataDir);
		const tables = upgraded
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);

		expect(tables).toContain('poi_provider_mappings');
		expect(tables).toContain('poi_enrichment_cache');
		expect(upgraded.pragma('user_version', { simple: true })).toBe(4);
		upgraded.close();
	});

	test('versions provider mappings for query changes', (): void => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-app-provider-upgrade-'));
		temporaryDirectories.push(dataDir);
		const versionTwo = createDatabase(dataDir, applicationDatabaseMigrations.slice(0, 2));
		versionTwo
			.prepare(
				`INSERT INTO poi_provider_mappings
				(feature_id, provider, provider_id, source, mapped_at)
				VALUES ('search-feature', 'tripadvisor', '123', 'search', '2026-08-26T10:00:00.000Z'),
					('manual-feature', 'tripadvisor', '456', 'kml', '2026-08-26T10:00:00.000Z')`
			)
			.run();
		versionTwo
			.prepare(
				`INSERT INTO poi_enrichment_cache
				(feature_id, provider, schema_version, payload, fetched_at, expires_at)
				VALUES ('search-feature', 'tripadvisor', 3, '{}', '2026-08-26T10:00:00.000Z', '2026-09-26T10:00:00.000Z'),
					('manual-feature', 'tripadvisor', 3, '{}', '2026-08-26T10:00:00.000Z', '2026-09-26T10:00:00.000Z')`
			)
			.run();
		versionTwo.close();

		const upgraded = createApplicationDatabase(dataDir);
		const mappings = upgraded
			.prepare('SELECT feature_id, query_version FROM poi_provider_mappings ORDER BY feature_id')
			.all();
		expect(mappings).toEqual([
			{ feature_id: 'manual-feature', query_version: 1 },
			{ feature_id: 'search-feature', query_version: 1 }
		]);
		expect(upgraded.prepare('SELECT COUNT(*) AS count FROM poi_enrichment_cache').get()).toEqual({
			count: 2
		});
		expect(upgraded.pragma('user_version', { simple: true })).toBe(4);
		upgraded.close();
	});
});
