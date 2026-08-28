import { handleRefreshMap } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals }) => {
	return handleRefreshMap(requireTrip(locals).id);
};
