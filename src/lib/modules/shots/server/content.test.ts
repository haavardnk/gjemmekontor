import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { defaultModuleIds } from '$lib/app/modules/catalog';
import { createApplicationDatabase } from '$lib/app/server/database';
import { createTrip, updateTripGeneral } from '$lib/app/server/trip-settings';

import { listShotCloneSources, loadTripShotContent, replaceTripShotContent } from './content';

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-shots-'));
	db = createApplicationDatabase(dataDir);
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function create(name: string): string {
	return createTrip(db, {
		name,
		destination: '',
		startsOn: '2027-06-01',
		endsOn: '2027-06-03',
		timezone: 'Europe/Oslo',
		welcomeText: 'Velkommen om bord',
		password: 'shared-trip-password',
		memberIds: [],
		modules: {
			order: [...defaultModuleIds],
			enabled: ['shots'],
			mapGoogleMyMapsId: '',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: [],
			mapOfflinePackages: [],
			shoppingListUuid: '',
			shoppingListName: '',
			shoppingListVerifiedAt: ''
		}
	});
}

describe('persisted trip shot content', (): void => {
	test('gives every new trip its own persisted blank pack', (): void => {
		const firstTripId = create('Første reise');
		const secondTripId = create('Andre reise');

		const first = loadTripShotContent(db, firstTripId);
		const second = loadTripShotContent(db, secondTripId);
		expect(first.packId).toBeDefined();
		expect(second.packId).toBeDefined();
		expect(first.packId).not.toBe(second.packId);
		expect(first.content.dayPlans).toHaveLength(3);
		expect(first.content.modules).toEqual({});
	});

	test('keeps old definitions when a new version is saved', (): void => {
		const tripId = create('Versjonert reise');
		const original = loadTripShotContent(db, tripId);

		replaceTripShotContent(db, tripId, { mode: 'standard' });
		const current = loadTripShotContent(db, tripId);

		expect(current.version).toBe(original.version + 1);
		expect(current.packId).not.toBe(original.packId);
		expect(Object.keys(current.content.modules).length).toBeGreaterThan(0);
		expect(
			db.prepare('SELECT content_json FROM shot_content_packs WHERE id = ?').get(original.packId)
		).toBeDefined();
	});

	test('clones definitions without copying operational shot state', (): void => {
		const sourceTripId = create('Kildereise');
		const targetTripId = create('Målreise');
		replaceTripShotContent(db, sourceTripId, { mode: 'standard' });
		db.prepare(
			`INSERT INTO trip_state_entries
			 (trip_id, key, value, revision, client_id, mutation_id, updated_at)
			 VALUES (?, 'shots:d0:module:dagensHistorie:0', 'true', 1, 'source-client', 'source-mutation', '2027-06-01')`
		).run(sourceTripId);

		replaceTripShotContent(db, targetTripId, { mode: 'clone', sourceTripId });

		expect(loadTripShotContent(db, targetTripId).content).toEqual(
			loadTripShotContent(db, sourceTripId).content
		);
		expect(
			db
				.prepare('SELECT COUNT(*) AS count FROM trip_state_entries WHERE trip_id = ?')
				.get(targetTripId)
		).toEqual({ count: 0 });
		expect(listShotCloneSources(db, targetTripId)).toContainEqual(
			expect.objectContaining({ tripId: sourceTripId, tripName: 'Kildereise' })
		);
	});

	test('rejects cloning from the same trip without changing its link', (): void => {
		const tripId = create('Samme reise');
		const before = loadTripShotContent(db, tripId);

		expect(() =>
			replaceTripShotContent(db, tripId, { mode: 'clone', sourceTripId: tripId })
		).toThrow('SHOT_CLONE_SOURCE_INVALID');
		expect(loadTripShotContent(db, tripId).packId).toBe(before.packId);
	});

	test('versions and aligns day assignments when trip dates change', (): void => {
		const tripId = create('Reise med nye datoer');
		replaceTripShotContent(db, tripId, { mode: 'standard' });
		const before = loadTripShotContent(db, tripId);

		updateTripGeneral(db, tripId, {
			name: 'Reise med nye datoer',
			destination: '',
			startsOn: '2027-06-01',
			endsOn: '2027-06-05',
			timezone: 'Europe/Oslo',
			welcomeText: 'Velkommen om bord'
		});
		const after = loadTripShotContent(db, tripId);

		expect(after.version).toBe(before.version + 1);
		expect(after.content.dayPlans.map((plan) => plan.dayIndex)).toEqual([0, 1, 2, 3, 4]);
		expect(after.content.dayPlans.slice(3).every((plan) => plan.modules.length === 0)).toBe(true);
		expect(
			db.prepare('SELECT content_json FROM shot_content_packs WHERE id = ?').get(before.packId)
		).toBeDefined();
	});
});
