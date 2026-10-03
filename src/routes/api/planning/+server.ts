import { loadPlanningPageData, startPlanningBackgroundWork } from '$lib/modules/planning/server';
import { apiSuccess } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const tripId = requireTrip(locals).id;
	startPlanningBackgroundWork(locals.db, tripId);
	return apiSuccess(loadPlanningPageData(locals.db, tripId));
};
