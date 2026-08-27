import { getDatabase } from '$lib/app/server/database';
import { handleRetainGearItem } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleRetainGearItem(getDatabase(), locals.trip.id, params.itemId);
};
