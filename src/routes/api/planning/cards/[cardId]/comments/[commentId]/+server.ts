import {
	handleDeletePlanningComment,
	handleUpdatePlanningComment
} from '$lib/modules/planning/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, locals, params }) =>
	handleUpdatePlanningComment(
		request,
		locals.db,
		requireTrip(locals).id,
		params.cardId,
		params.commentId
	);

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleDeletePlanningComment(locals.db, requireTrip(locals).id, params.cardId, params.commentId);
