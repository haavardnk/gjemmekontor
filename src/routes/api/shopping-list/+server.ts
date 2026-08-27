import { getDatabase } from '$lib/app/server/database';
import { getBringService, handleGetShoppingList } from '$lib/modules/shopping-list/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleGetShoppingList(getBringService(getDatabase(), locals.trip.id));
};
