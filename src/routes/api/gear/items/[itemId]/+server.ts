import { getDatabase } from '$lib/app/server/database';
import { handleArchiveGearItem, handleSaveGearItem } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleSaveGearItem(request, getDatabase(), locals.trip.id, params.itemId);
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleArchiveGearItem(getDatabase(), locals.trip.id, params.itemId);
};
