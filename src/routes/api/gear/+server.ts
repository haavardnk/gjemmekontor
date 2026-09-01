import { loadGearPageData } from '$lib/modules/gear/server';
import { apiSuccess } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) =>
	apiSuccess(loadGearPageData(locals.db, requireTrip(locals).id));
