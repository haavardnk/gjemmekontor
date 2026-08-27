import { getDatabase } from '$lib/app/server/database';
import { handleDepthContourTile } from '$lib/modules/map/server';
import { loadTripMapConfig } from '$lib/modules/map/server/config';
import { apiError } from '$lib/server/api';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	if (
		!loadTripMapConfig(getDatabase(), locals.trip.id).enabledOverlays.includes('depth-contours')
	) {
		return apiError('DEPTH_CONTOURS_DISABLED', 404);
	}
	return handleDepthContourTile(params.z, params.x, params.y);
};
