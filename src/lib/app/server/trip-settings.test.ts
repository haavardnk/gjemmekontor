import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { defaultModuleIds, type ModuleId } from '$lib/app/modules/catalog';
import { loadTripBringConfig } from '$lib/modules/shopping-list/server/bring';

import { createApplicationDatabase } from './database';
import {
	activateTrip,
	addPersonToTrip,
	createTrip,
	getTripSettings,
	removePersonFromTrip,
	setTripMapConfiguration,
	setTripModules,
	setTripPassword,
	setTripShoppingListConnection,
	tripReadiness,
	updateTripGeneral
} from './trip-settings';

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-settings-'));
	db = createApplicationDatabase(dataDir);
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

const general = {
	name: 'Sørlandet 2027',
	destination: 'Sørlandet',
	startsOn: '2027-07-01',
	endsOn: '2027-07-03',
	timezone: 'Europe/Oslo',
	welcomeText: 'Velkommen om bord'
};

describe('trip settings', (): void => {
	test('creates an active trip atomically with members and ordered modules', (): void => {
		const personId = addPersonToTripDraft('Tina');
		const order: ModuleId[] = ['gear', ...defaultModuleIds.filter((id) => id !== 'gear')];
		const tripId = createTrip(db, {
			...general,
			password: 'shared-trip-password',
			memberIds: [personId],
			modules: {
				order,
				enabled: ['gear', 'menu'],
				mapGoogleMyMapsId: '',
				mapDefaultMode: 'normal',
				mapEnabledOverlays: ['ais', 'depth-contours'],
				mapOfflinePackages: [],
				shoppingListUuid: '',
				shoppingListName: '',
				shoppingListVerifiedAt: ''
			}
		});

		const settings = getTripSettings(db, tripId);
		expect(settings).toMatchObject({
			name: 'Sørlandet 2027',
			status: 'active',
			hasPassword: true
		});
		expect(settings?.modules.map((module) => module.id)).toEqual(order);
		expect(settings?.people.find((person) => person.id === personId)?.member).toBe(true);
		expect(db.prepare('SELECT COUNT(*) AS count FROM trip_days WHERE active = 1').get()).toEqual({
			count: 3
		});
	});

	test('deactivates removed dates and reuses their stable IDs', (): void => {
		const tripId = createTestTrip();
		const original = db
			.prepare("SELECT id FROM trip_days WHERE trip_id = ? AND calendar_date = '2027-07-03'")
			.get(tripId) as { id: string };

		updateTripGeneral(db, tripId, { ...general, endsOn: '2027-07-02' });
		expect(
			db
				.prepare("SELECT active FROM trip_days WHERE trip_id = ? AND calendar_date = '2027-07-03'")
				.get(tripId)
		).toEqual({ active: 0 });

		updateTripGeneral(db, tripId, general);
		expect(
			db
				.prepare(
					"SELECT id, active FROM trip_days WHERE trip_id = ? AND calendar_date = '2027-07-03'"
				)
				.get(tripId)
		).toEqual({ id: original.id, active: 1 });
	});

	test('keeps people global after they leave a trip', (): void => {
		const tripId = createTestTrip();
		const personId = addPersonToTrip(db, tripId, { displayName: 'Oskar' });
		removePersonFromTrip(db, tripId, personId);

		expect(db.prepare('SELECT display_name FROM people WHERE id = ?').get(personId)).toEqual({
			display_name: 'Oskar'
		});
		expect(
			getTripSettings(db, tripId)?.people.find((person) => person.id === personId)
		).toMatchObject({ member: false });
	});

	test('moves an invalid module setup to draft until fixed', (): void => {
		const tripId = createTestTrip();
		setTripModules(db, tripId, {
			order: [...defaultModuleIds],
			enabled: ['map'],
			mapGoogleMyMapsId: '',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: ['ais', 'depth-contours'],
			mapOfflinePackages: [],
			shoppingListUuid: '',
			shoppingListName: '',
			shoppingListVerifiedAt: ''
		});
		expect(getTripSettings(db, tripId)?.status).toBe('draft');
		expect(tripReadiness(db, tripId).issues).toContain('Kart trenger en Google My Maps-ID.');

		setTripModules(db, tripId, {
			order: [...defaultModuleIds],
			enabled: ['map'],
			mapGoogleMyMapsId: 'public-map-id',
			mapDefaultMode: 'nautical',
			mapEnabledOverlays: ['depth-contours'],
			mapOfflinePackages: ['nautical'],
			shoppingListUuid: '',
			shoppingListName: '',
			shoppingListVerifiedAt: ''
		});
		expect(activateTrip(db, tripId)).toEqual({ ready: true, issues: [] });
		expect(getTripSettings(db, tripId)?.status).toBe('active');
		expect(
			getTripSettings(db, tripId)?.modules.find((module) => module.id === 'map')?.config
		).toEqual({
			googleMyMapsId: 'public-map-id',
			defaultMode: 'nautical',
			enabledOverlays: ['depth-contours'],
			offlinePackages: ['nautical']
		});
	});

	test('increments password versions without retaining plaintext', (): void => {
		const tripId = createTestTrip();
		const before = db
			.prepare('SELECT credential_version, password_hash FROM trip_credentials WHERE trip_id = ?')
			.get(tripId) as { credential_version: number; password_hash: string };
		setTripPassword(db, tripId, 'replacement-trip-password');
		const after = db
			.prepare('SELECT credential_version, password_hash FROM trip_credentials WHERE trip_id = ?')
			.get(tripId) as { credential_version: number; password_hash: string };
		expect(after.credential_version).toBe(before.credential_version + 1);
		expect(after.password_hash).not.toBe(before.password_hash);
		expect(after.password_hash).not.toContain('replacement-trip-password');
	});
	test('updates map configuration without changing module selection', (): void => {
		const tripId = createTestTrip();
		const before = getTripSettings(db, tripId)?.modules.map(({ id, enabled }) => ({ id, enabled }));

		setTripMapConfiguration(db, tripId, {
			mapGoogleMyMapsId: 'updated-map-id',
			mapDefaultMode: 'satellite',
			mapEnabledOverlays: ['ais'],
			mapOfflinePackages: ['normal', 'satellite']
		});

		const settings = getTripSettings(db, tripId);
		expect(settings?.modules.map(({ id, enabled }) => ({ id, enabled }))).toEqual(before);
		expect(settings?.modules.find((module) => module.id === 'map')?.config).toEqual({
			googleMyMapsId: 'updated-map-id',
			defaultMode: 'satellite',
			enabledOverlays: ['ais'],
			offlinePackages: ['normal', 'satellite']
		});
	});

	test('keeps a verified Bring connection through trip edits', (): void => {
		const tripId = createTestTrip();
		setTripShoppingListConnection(db, tripId, {
			listUuid: 'bring-kroatia',
			listName: 'Kroatia 2026',
			verifiedAt: '2026-08-27T12:00:00.000Z'
		});

		updateTripGeneral(db, tripId, { ...general, name: 'Nytt reisenavn' });
		setTripModules(db, tripId, {
			order: [...defaultModuleIds].reverse(),
			enabled: ['gear'],
			mapGoogleMyMapsId: '',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: [],
			mapOfflinePackages: [],
			shoppingListUuid: 'bring-kroatia',
			shoppingListName: 'Kroatia 2026',
			shoppingListVerifiedAt: '2026-08-27T12:00:00.000Z'
		});

		expect(
			getTripSettings(db, tripId)?.modules.find((module) => module.id === 'shopping-list')?.config
		).toEqual({
			listUuid: 'bring-kroatia',
			listName: 'Kroatia 2026',
			providerStatus: 'verified',
			verifiedAt: '2026-08-27T12:00:00.000Z'
		});
	});

	test('loads only the current trip Bring UUID', (): void => {
		const firstTripId = createTestTrip();
		const secondTripId = createTrip(db, {
			...general,
			name: 'Danmark 2027',
			password: 'another-trip-password',
			memberIds: [],
			modules: {
				order: [...defaultModuleIds],
				enabled: ['gear'],
				mapGoogleMyMapsId: '',
				mapDefaultMode: 'normal',
				mapEnabledOverlays: [],
				mapOfflinePackages: [],
				shoppingListUuid: '',
				shoppingListName: '',
				shoppingListVerifiedAt: ''
			}
		});
		setTripShoppingListConnection(db, firstTripId, {
			listUuid: 'first-list',
			listName: 'Første'
		});
		setTripShoppingListConnection(db, secondTripId, {
			listUuid: 'second-list',
			listName: 'Andre'
		});
		db.prepare("UPDATE trip_modules SET enabled = 1 WHERE module_id = 'shopping-list'").run();
		const credentials = { email: 'crew@example.com', password: 'shared-provider-secret' };

		expect(loadTripBringConfig(db, firstTripId, credentials)?.listUuid).toBe('first-list');
		expect(loadTripBringConfig(db, secondTripId, credentials)?.listUuid).toBe('second-list');
	});
});

function addPersonToTripDraft(displayName: string): string {
	const id = crypto.randomUUID();
	db.prepare(
		`INSERT INTO people
		 (id, display_name, short_name, color, archived_at, created_at, updated_at)
		 VALUES (?, ?, NULL, NULL, NULL, '2026-08-27', '2026-08-27')`
	).run(id, displayName);
	return id;
}

function createTestTrip(): string {
	return createTrip(db, {
		...general,
		password: 'shared-trip-password',
		memberIds: [],
		modules: {
			order: [...defaultModuleIds],
			enabled: ['gear'],
			mapGoogleMyMapsId: '',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: ['ais', 'depth-contours'],
			mapOfflinePackages: [],
			shoppingListUuid: '',
			shoppingListName: '',
			shoppingListVerifiedAt: ''
		}
	});
}
