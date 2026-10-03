import { getMapRuntimeConfig } from '$lib/modules/map/server/config';
import { loadPlanningPageData } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	planning: loadPlanningPageData(locals.db, requireTrip(locals).id),
	googlePlacesApiKey: getMapRuntimeConfig().googlePlacesBrowserApiKey ?? ''
});
