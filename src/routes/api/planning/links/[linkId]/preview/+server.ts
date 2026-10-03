import {
	handleRetryPlanningLinkPreview,
	startPlanningBackgroundWork
} from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, params }) => {
	const tripId = requireTrip(locals).id;
	const response = handleRetryPlanningLinkPreview(locals.db, tripId, params.linkId);
	startPlanningBackgroundWork(locals.db, tripId);
	return response;
};
