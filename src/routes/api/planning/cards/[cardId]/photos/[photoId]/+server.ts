import { handleUploadPlanningPhoto, runtimePlanningFiles } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, locals, params }) => {
	const tripId = requireTrip(locals).id;
	return handleUploadPlanningPhoto(
		request,
		locals.db,
		tripId,
		params.cardId,
		params.photoId,
		runtimePlanningFiles(tripId)
	);
};
