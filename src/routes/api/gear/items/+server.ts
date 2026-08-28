import { handleSaveGearItem } from '$lib/modules/gear/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	return handleSaveGearItem(request, locals.db, requireTrip(locals).id);
};
