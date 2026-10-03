import {
	handleCreatePlanningCard,
	startPlanningBackgroundWork
} from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const tripId = requireTrip(locals).id;
	const response = await handleCreatePlanningCard(request, locals.db, tripId);
	if (response.ok) startPlanningBackgroundWork(locals.db, tripId);
	return response;
};
