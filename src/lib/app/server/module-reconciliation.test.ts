import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { defaultModuleIds } from '$lib/app/modules/catalog';

import { createApplicationDatabase } from './database';
import { reconcileBundledTripModules } from './module-reconciliation';
import { createTrip } from './trip-settings';

const databases: ReturnType<typeof createApplicationDatabase>[] = [];

afterEach((): void => {
	for (const database of databases.splice(0)) database.close();
});

test('adds newly bundled modules to existing trips disabled and at the end', (): void => {
	const database = createApplicationDatabase(mkdtempSync(join(tmpdir(), 'modules-')));
	databases.push(database);
	const tripId = randomUUID();
	createTrip(
		database,
		{
			name: 'Testtur',
			destination: 'Oslo',
			startsOn: '2026-09-01',
			endsOn: '2026-09-02',
			timezone: 'Europe/Oslo',
			welcomeText: 'Velkommen',
			password: 'test-password',
			memberIds: [],
			modules: {
				order: [...defaultModuleIds],
				enabled: ['itinerary'],
				mapGoogleMyMapsId: '',
				mapDefaultMode: 'normal',
				mapEnabledOverlays: [],
				mapOfflinePackages: [],
				shoppingListUuid: '',
				shoppingListName: '',
				shoppingListVerifiedAt: ''
			}
		},
		{ tripId }
	);
	database
		.prepare("DELETE FROM trip_modules WHERE trip_id = ? AND module_id = 'itinerary'")
		.run(tripId);

	reconcileBundledTripModules(database, (): Date => new Date('2026-08-29T12:00:00.000Z'));

	expect(
		database
			.prepare(
				"SELECT enabled, position FROM trip_modules WHERE trip_id = ? AND module_id = 'itinerary'"
			)
			.get(tripId)
	).toEqual({ enabled: 0, position: defaultModuleIds.length });
});
