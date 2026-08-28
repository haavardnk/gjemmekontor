import { handleGetGpx, handlePutGpx } from '$lib/modules/logbook/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ params, request, locals }) => {
	return handlePutGpx(request, params.id, locals.db, requireTrip(locals).id);
};

export const GET: RequestHandler = ({ params, locals }) => {
	return handleGetGpx(params.id, locals.db, requireTrip(locals).id);
};
