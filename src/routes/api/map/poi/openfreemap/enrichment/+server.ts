import { handleOpenFreeMapPoiEnrichment } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	return handleOpenFreeMapPoiEnrichment(requireTrip(locals).id, request);
};
