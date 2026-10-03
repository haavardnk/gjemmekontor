import {
	handleDeletePlanningCategory,
	handleUpdatePlanningCategory
} from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, locals, params }) =>
	handleUpdatePlanningCategory(request, locals.db, requireTrip(locals).id, params.categoryId);

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleDeletePlanningCategory(locals.db, requireTrip(locals).id, params.categoryId);
