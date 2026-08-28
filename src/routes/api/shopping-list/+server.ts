import { getBringService, handleGetShoppingList } from '$lib/modules/shopping-list/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	return handleGetShoppingList(getBringService(locals.db, requireTrip(locals).id));
};
