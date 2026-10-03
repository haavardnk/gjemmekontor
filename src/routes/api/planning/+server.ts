import { loadPlanningPageData } from '$lib/modules/planning/server';
import { apiSuccess } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) =>
	apiSuccess(loadPlanningPageData(locals.db, requireTrip(locals).id));
