import { handleOpenFreeMapPoiEnrichmentPhotos } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleOpenFreeMapPoiEnrichmentPhotos(locals.trip.id, request);
};
