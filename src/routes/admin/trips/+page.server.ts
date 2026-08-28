import { listAdminTrips } from '$lib/app/server/trips';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ trips: listAdminTrips(locals.db) });
