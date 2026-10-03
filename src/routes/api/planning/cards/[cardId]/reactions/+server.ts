import {
	handleDeletePlanningReaction,
	handleSetPlanningReaction
} from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, locals, params }) =>
	handleSetPlanningReaction(request, locals.db, requireTrip(locals).id, params.cardId);

export const DELETE: RequestHandler = ({ request, locals, params }) =>
	handleDeletePlanningReaction(request, locals.db, requireTrip(locals).id, params.cardId);
