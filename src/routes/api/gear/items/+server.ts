import { getDatabase } from '$lib/app/server/database';
import { handleSaveGearItem } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleSaveGearItem(request, getDatabase(), locals.trip.id);
};
