import { getDatabase } from '$lib/app/server/database';
import { listAdminTrips } from '$lib/app/server/trips';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ trips: listAdminTrips(getDatabase()) });
