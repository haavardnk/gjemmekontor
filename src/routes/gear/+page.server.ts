import { getDatabase } from '$lib/app/server/database';
import { loadGearPageData } from '$lib/modules/gear/server';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return loadGearPageData(getDatabase(), locals.trip.id);
};
