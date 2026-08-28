import { randomUUID } from 'node:crypto';

import { createApplicationDatabase } from '$lib/app/server/database';
import { createTrip } from '$lib/app/server/trip-settings';
import {
	activityModuleIds,
	backupChecks,
	scenarioGroups,
	shotModules
} from '$lib/modules/shots/domain/content';
import { shotsDayPlan } from '$lib/modules/shots/domain/day-plan';
import { cameraChoices } from '$lib/modules/shots/domain/digest';
import { replaceTripShotContent } from '$lib/modules/shots/server/content';
import { kroatia2026Days } from '$lib/trip/kroatia-2026';

const tripId = '82a8d607-acc9-4c50-a948-463e6a34ef25';

export default function globalSetup(): void {
	const dataDir = process.env.GJEMMEKONTOR_E2E_DATA_DIR;
	if (!dataDir) throw new Error('E2E_DATA_DIR_REQUIRED');
	const database = createApplicationDatabase(dataDir);
	try {
		const now = new Date().toISOString();
		const memberIds = ['Håvard', 'Tina', 'Tomine', 'Odd', 'Lise', 'Oskar'].map((name) => {
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
				name: 'Kroatia 2026',
				destination: 'Kroatia',
				startsOn: '2026-09-05',
				endsOn: '2026-09-23',
				timezone: 'Europe/Zagreb',
				welcomeText: 'Velkommen om bord på S/Y Bad Buoy',
				password: 'test-password',
				memberIds,
				shots: { mode: 'blank' },
				modules: {
					order: ['map', 'shots', 'logbook', 'shopping-list', 'menu', 'gear', 'rule-book'],
					enabled: ['map', 'shots', 'logbook', 'shopping-list', 'menu', 'gear', 'rule-book'],
					mapGoogleMyMapsId: 'test-map',
					mapDefaultMode: 'normal',
					mapEnabledOverlays: ['ais', 'depth-contours'],
					mapOfflinePackages: ['normal'],
					shoppingListUuid: 'e2e-bring-list',
					shoppingListName: 'Kroatia 2026',
					shoppingListVerifiedAt: '2026-08-28T08:00:00.000Z'
				}
			},
			{ tripId }
		);
		const updateDay = database.prepare(
			`UPDATE trip_days SET date_label = ?, title = ?, phase = ?, updated_at = ?
			 WHERE trip_id = ? AND position = ?`
		);
		for (const day of kroatia2026Days) {
			updateDay.run(day.dateLabel, day.title, day.phase, now, tripId, day.index);
		}
		replaceTripShotContent(database, tripId, {
			mode: 'custom',
			content: {
				version: 1,
				cameras: [...cameraChoices],
				backupChecks: [...backupChecks],
				modules: shotModules,
				activityModuleIds: [...activityModuleIds],
				scenarioGroups: scenarioGroups.map((group) => ({
					title: group.title,
					ids: [...group.ids]
				})),
				dayPlans: kroatia2026Days.map((day) => ({
					dayIndex: day.index,
					...shotsDayPlan(day.index)
				}))
			}
		});
	} finally {
		database.close();
	}
}
