import { handleGetState } from '$lib/server/state';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, params, locals }) =>
	handleGetState(request, locals.db, params.tripId);
