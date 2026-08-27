import { getDatabase } from '$lib/app/server/database';
import { loadTripMapConfig } from '$lib/modules/map/server/config';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	const config = loadTripMapConfig(getDatabase(), locals.trip.id);
	return {
		defaultMode: config.defaultMode,
		enabledOverlays: config.enabledOverlays
	};
};
