import { handleOfflineMapFile } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request, locals }) => {
	return handleOfflineMapFile(requireTrip(locals).id, params.mode, request, locals.db);
};
