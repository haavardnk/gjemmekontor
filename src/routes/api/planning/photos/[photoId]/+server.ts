import { handleDeletePlanningPhoto, runtimePlanningFiles } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ locals, params }) => {
	const tripId = requireTrip(locals).id;
	return handleDeletePlanningPhoto(locals.db, tripId, params.photoId, runtimePlanningFiles(tripId));
};
