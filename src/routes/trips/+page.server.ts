import { listSelectableTrips } from '$lib/app/server/trips';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	trips: listSelectableTrips(locals.db),
	adminAuthenticated: locals.adminAuthenticated
});
