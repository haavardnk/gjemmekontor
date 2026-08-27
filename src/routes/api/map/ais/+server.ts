import { handleGetAis } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleGetAis(locals.trip.id);
};
