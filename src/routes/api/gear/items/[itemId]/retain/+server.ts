import { handleRetainGearItem } from '$lib/modules/gear/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) => {
	return handleRetainGearItem(locals.db, requireTrip(locals).id, params.itemId);
};
