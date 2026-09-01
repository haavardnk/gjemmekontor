import { listItineraryMembers } from '$lib/modules/itinerary/server/members';
import { getMapRuntimeConfig } from '$lib/modules/map/server/config';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	members: listItineraryMembers(locals.db, requireTrip(locals).id),
	googlePlacesApiKey: getMapRuntimeConfig().googlePlacesBrowserApiKey ?? ''
});
