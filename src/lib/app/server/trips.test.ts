import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from './database';
import { firstTripModulePath, getTripBySlug, listSelectableTrips } from './trips';

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-trips-'));
	db = createApplicationDatabase(dataDir);
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, destination, starts_on, ends_on, timezone, locale,
		  status, visibility, welcome_text, created_at, updated_at)
		 VALUES ('trip-a', 'testtur', 'Testtur', '', '2027-06-01', '2027-06-04',
		         'Europe/Oslo', 'nb-NO', 'active', 'listed', 'Velkommen', ?, ?)`
	).run('2026-08-27', '2026-08-27');
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('trip selection', (): void => {
	test('marks a trip without a password as requiring setup', (): void => {
		expect(listSelectableTrips(db)).toMatchObject([
			{ id: 'trip-a', slug: 'testtur', setupRequired: true }
		]);
	});

	test('preserves the trip module order for navigation and landing', (): void => {
		db.prepare(
			`INSERT INTO trip_credentials
			 (trip_id, password_hash, credential_version, updated_at)
			 VALUES ('trip-a', 'hash', 1, '2026-08-27')`
		).run();
		const insert = db.prepare(
			`INSERT INTO trip_modules
			 (trip_id, module_id, enabled, position, config_version, config_json,
			  configured_at, updated_at)
			 VALUES ('trip-a', ?, 1, ?, 1, '{}', '2026-08-27', '2026-08-27')`
		);
		insert.run('gear', 0);
		insert.run('map', 1);

		const trip = getTripBySlug(db, 'testtur');
		expect(trip?.enabledModuleIds).toEqual(['gear', 'map']);
		expect(trip && firstTripModulePath(trip)).toBe('/gear');
	});
});
