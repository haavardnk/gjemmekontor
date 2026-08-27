import { getDatabase } from '$lib/app/server/database';
import { handleSyncState } from '$lib/server/state';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, params, locals }) =>
	handleSyncState(request, getDatabase(), params.tripId, locals.trip?.enabledModuleIds ?? []);
