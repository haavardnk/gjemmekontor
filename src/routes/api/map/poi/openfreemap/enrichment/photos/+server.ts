import { handleOpenFreeMapPoiEnrichmentPhotos } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	return handleOpenFreeMapPoiEnrichmentPhotos(requireTrip(locals).id, request, locals.db);
};
