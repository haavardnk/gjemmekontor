import { handleArchiveGearItem, handleSaveGearItem } from '$lib/modules/gear/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params, locals }) => {
	return handleSaveGearItem(request, locals.db, requireTrip(locals).id, params.itemId);
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	return handleArchiveGearItem(locals.db, requireTrip(locals).id, params.itemId);
};
