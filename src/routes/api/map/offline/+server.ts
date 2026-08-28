import { handleOfflineMapManifest } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	return handleOfflineMapManifest(requireTrip(locals).id, locals.db);
};
