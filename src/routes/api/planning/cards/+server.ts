import { handleCreatePlanningCard } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) =>
	handleCreatePlanningCard(request, locals.db, requireTrip(locals).id);
