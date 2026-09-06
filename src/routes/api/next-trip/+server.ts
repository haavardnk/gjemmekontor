import { loadNextTripPageData } from '$lib/modules/next-trip/server';
import { apiSuccess } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) =>
	apiSuccess(loadNextTripPageData(locals.db, requireTrip(locals).id));
