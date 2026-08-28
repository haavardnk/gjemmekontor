import { loadGearPageData } from '$lib/modules/gear/server';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	return loadGearPageData(locals.db, requireTrip(locals).id);
};
