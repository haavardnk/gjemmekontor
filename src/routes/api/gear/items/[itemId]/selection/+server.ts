import { getDatabase } from '$lib/app/server/database';
import { handleGearSelection } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleGearSelection(request, getDatabase(), locals.trip.id, params.itemId);
};
