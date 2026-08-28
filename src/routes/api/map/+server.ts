import { handleGetMap } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	return handleGetMap(requireTrip(locals).id);
};
