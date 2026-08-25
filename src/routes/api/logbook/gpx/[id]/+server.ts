import { getDatabase } from '$lib/app/server/database';
import { handleGetGpx, handlePutGpx } from '$lib/modules/logbook/server';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ params, request }) =>
	handlePutGpx(request, params.id, getDatabase());

export const GET: RequestHandler = ({ params }) => handleGetGpx(params.id, getDatabase());
