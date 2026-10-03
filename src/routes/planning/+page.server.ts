import { getMapRuntimeConfig } from '$lib/modules/map/server/config';
import { loadPlanningPageData, startPlanningBackgroundWork } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const tripId = requireTrip(locals).id;
	startPlanningBackgroundWork(locals.db, tripId);
	return {
		planning: loadPlanningPageData(locals.db, tripId),
		googlePlacesApiKey: getMapRuntimeConfig().googlePlacesBrowserApiKey ?? ''
	};
};
