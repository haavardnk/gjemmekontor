import { randomUUID } from 'node:crypto';

import { createApplicationDatabase } from '$lib/app/server/application-database';
import { createTrip } from '$lib/app/server/trip-settings';

const tripId = '00000000-0000-4000-8000-000000000001';

export default function globalSetup(): void {
	const dataDir = process.env.GJEMMEKONTOR_E2E_DATA_DIR;
	if (!dataDir) throw new Error('E2E_DATA_DIR_REQUIRED');
	const database = createApplicationDatabase(dataDir);
	try {
		const now = new Date().toISOString();
		const memberIds = ['Ada', 'Bo', 'Cleo', 'Dina', 'Eli', 'Finn'].map((name) => {
			const id = randomUUID();
			database
				.prepare(
					`INSERT INTO people
					 (id, display_name, short_name, color, archived_at, created_at, updated_at)
					 VALUES (?, ?, NULL, NULL, NULL, ?, ?)`
				)
				.run(id, name, now, now);
			return id;
		});
		createTrip(
			database,
			{
				name: 'Testreise',
				destination: 'Teststed',
				startsOn: '2027-06-01',
				endsOn: '2027-06-19',
				timezone: 'Europe/Oslo',
				welcomeText: 'Velkommen til testreisen',
				password: 'test-password',
				memberIds,
				shots: { mode: 'standard' },
				modules: {
					order: [
						'map',
						'shots',
						'logbook',
						'shopping-list',
						'itinerary',
						'menu',
						'gear',
						'rule-book'
					],
					enabled: [
						'map',
						'itinerary',
						'shots',
						'logbook',
						'shopping-list',
						'menu',
						'gear',
						'rule-book'
					],
					mapGoogleMyMapsId: 'e2e-map',
					mapDefaultMode: 'normal',
					mapEnabledOverlays: ['ais', 'depth-contours'],
					mapOfflinePackages: ['normal'],
					shoppingListUuid: 'e2e-list',
					shoppingListName: 'Testreise',
					shoppingListVerifiedAt: '2026-08-28T08:00:00.000Z'
				}
			},
			{ tripId }
		);
		database
			.prepare(
				`UPDATE trip_days
				 SET date_label = 'Testdag ' || (position + 1),
				     title = 'Dag ' || (position + 1), phase = 'Testfase', updated_at = ?
				 WHERE trip_id = ?`
			)
			.run(now, tripId);
	} finally {
		database.close();
	}
}
