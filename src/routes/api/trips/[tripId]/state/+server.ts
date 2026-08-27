import { getDatabase } from '$lib/app/server/database';
import { handleGetState } from '$lib/server/state';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, params }) =>
	handleGetState(request, getDatabase(), params.tripId);
