import { getDatabase } from '$lib/app/server/database';
import { listTripDays } from '$lib/app/server/trip-days';
import { loadTripShotContent } from '$lib/modules/shots/server/content';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	const db = getDatabase();
	return {
		days: listTripDays(db, locals.trip.id),
		shotContent: loadTripShotContent(db, locals.trip.id).content
	};
};
