import { getDatabase } from '$lib/app/server/database';
import { handleUpdateMenuEntry } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, params, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleUpdateMenuEntry(request, getDatabase(), locals.trip.id, params.entryId);
};
