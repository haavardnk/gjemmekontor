import { handleDeletePlanningCard, handleUpdatePlanningCard } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, locals, params }) =>
	handleUpdatePlanningCard(request, locals.db, requireTrip(locals).id, params.cardId);

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleDeletePlanningCard(locals.db, requireTrip(locals).id, params.cardId);
