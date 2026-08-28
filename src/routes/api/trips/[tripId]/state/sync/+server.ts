import { handleSyncState } from '$lib/server/state';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, params, locals }) =>
	handleSyncState(request, locals.db, params.tripId, locals.trip?.enabledModuleIds ?? []);
