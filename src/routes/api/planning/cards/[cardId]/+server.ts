import {
	handleDeletePlanningCard,
	handleUpdatePlanningCard,
	runtimePlanningFiles,
	startPlanningBackgroundWork
} from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const tripId = requireTrip(locals).id;
	const response = await handleUpdatePlanningCard(
		request,
		locals.db,
		tripId,
		params.cardId,
		runtimePlanningFiles(tripId)
	);
	if (response.ok) startPlanningBackgroundWork(locals.db, tripId);
	return response;
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	const tripId = requireTrip(locals).id;
	return handleDeletePlanningCard(locals.db, tripId, params.cardId, runtimePlanningFiles(tripId));
};
