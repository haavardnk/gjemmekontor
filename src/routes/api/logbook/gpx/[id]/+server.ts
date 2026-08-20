import { getDatabase } from '$lib/server/database';
import { handleGetGpx, handlePutGpx } from '$lib/server/gpx';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ params, request }) =>
	handlePutGpx(request, params.id, getDatabase());

export const GET: RequestHandler = ({ params }) => handleGetGpx(params.id, getDatabase());
