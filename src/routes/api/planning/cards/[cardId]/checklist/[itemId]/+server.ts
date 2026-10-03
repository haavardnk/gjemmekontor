import { handleTogglePlanningChecklistItem } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, locals, params }) =>
	handleTogglePlanningChecklistItem(
		request,
		locals.db,
		requireTrip(locals).id,
		params.cardId,
		params.itemId
	);
