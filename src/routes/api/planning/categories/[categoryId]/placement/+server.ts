import { handlePlacePlanningCategory } from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, locals, params }) =>
	handlePlacePlanningCategory(request, locals.db, requireTrip(locals).id, params.categoryId);
