import { handleGetAis } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	return handleGetAis(requireTrip(locals).id);
};
