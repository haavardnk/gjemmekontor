import { handleUpdateMenuEntry } from '$lib/modules/menu/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, params, locals }) => {
	return handleUpdateMenuEntry(request, locals.db, requireTrip(locals).id, params.entryId);
};
