import { getDatabase } from '$lib/app/server/database';
import { listSelectableTrips } from '$lib/app/server/trips';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	trips: listSelectableTrips(getDatabase()),
	adminAuthenticated: locals.adminAuthenticated
});
