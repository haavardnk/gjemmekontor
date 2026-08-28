import { handleDepthContourTile } from '$lib/modules/map/server';
import { loadTripMapConfig } from '$lib/modules/map/server/config';
import { apiError } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	const trip = requireTrip(locals);
	if (!loadTripMapConfig(locals.db, trip.id).enabledOverlays.includes('depth-contours')) {
		return apiError('DEPTH_CONTOURS_DISABLED', 404);
	}
	return handleDepthContourTile(params.z, params.x, params.y);
};
