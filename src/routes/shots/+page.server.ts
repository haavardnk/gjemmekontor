import { listTripDays } from '$lib/app/server/trip-days';
import { loadTripShotContent } from '$lib/modules/shots/server/content';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const trip = requireTrip(locals);
	return {
		days: listTripDays(locals.db, trip.id),
		shotContent: loadTripShotContent(locals.db, trip.id).content
	};
};
