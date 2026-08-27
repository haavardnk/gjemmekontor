import { handleRefreshMap } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleRefreshMap(locals.trip.id);
};
