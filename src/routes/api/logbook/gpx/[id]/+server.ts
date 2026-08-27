import { getDatabase } from '$lib/app/server/database';
import { handleGetGpx, handlePutGpx } from '$lib/modules/logbook/server';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ params, request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handlePutGpx(request, params.id, getDatabase(), locals.trip.id);
};

export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleGetGpx(params.id, getDatabase(), locals.trip.id);
};
