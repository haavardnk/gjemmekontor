import { loadNextTripPageData } from '$lib/modules/next-trip/server';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) =>
	loadNextTripPageData(locals.db, requireTrip(locals).id);
