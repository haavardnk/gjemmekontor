import { handleOfflineMapFile } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleOfflineMapFile(locals.trip.id, params.mode, request);
};
