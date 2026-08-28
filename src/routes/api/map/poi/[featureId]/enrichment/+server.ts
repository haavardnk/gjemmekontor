import { handleGetPoiEnrichment } from '$lib/modules/map/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	return handleGetPoiEnrichment(requireTrip(locals).id, params.featureId);
};
