import { handleGetPoiEnrichmentPhotos } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleGetPoiEnrichmentPhotos(locals.trip.id, params.featureId);
};
