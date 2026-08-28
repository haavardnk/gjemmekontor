import { handleGearPacking } from '$lib/modules/gear/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, params, locals }) => {
	return handleGearPacking(request, locals.db, requireTrip(locals).id, params.itemId);
};
