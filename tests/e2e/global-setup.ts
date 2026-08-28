import { initializeApplicationDatabase } from '$lib/app/server/database';
import { kroatia2026TripId } from '$lib/app/server/legacy-trip-import';
import { activateTrip, setTripModules, setTripPassword } from '$lib/app/server/trip-settings';

export default function globalSetup(): void {
	const dataDir = process.env.GJEMMEKONTOR_E2E_DATA_DIR;
	if (!dataDir) throw new Error('E2E_DATA_DIR_REQUIRED');
	const database = initializeApplicationDatabase(dataDir);
	try {
		setTripPassword(database, kroatia2026TripId, 'test-password');
		setTripModules(database, kroatia2026TripId, {
			order: ['map', 'shots', 'logbook', 'shopping-list', 'menu', 'gear', 'rule-book'],
			enabled: ['map', 'shots', 'logbook', 'shopping-list', 'menu', 'gear', 'rule-book'],
			mapGoogleMyMapsId: 'test-map',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: ['ais', 'depth-contours'],
			mapOfflinePackages: ['normal'],
			shoppingListUuid: 'e2e-bring-list',
			shoppingListName: 'Kroatia 2026',
			shoppingListVerifiedAt: '2026-08-28T08:00:00.000Z'
		});
		const readiness = activateTrip(database, kroatia2026TripId);
		if (!readiness.ready) throw new Error(`E2E_TRIP_NOT_READY:${readiness.issues.join(',')}`);
	} finally {
		database.close();
	}
}
