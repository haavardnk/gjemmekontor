import { handlePlanningLinkImage, runtimePlanningFiles } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
	const tripId = requireTrip(locals).id;
	return handlePlanningLinkImage(locals.db, tripId, params.linkId, runtimePlanningFiles(tripId));
};
