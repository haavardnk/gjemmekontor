import {
	handleDeleteNextTripComment,
	handleUpdateNextTripComment
} from '$lib/modules/next-trip/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ request, locals, params }) =>
	handleUpdateNextTripComment(
		request,
		locals.db,
		requireTrip(locals).id,
		params.suggestionId,
		params.commentId
	);

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleDeleteNextTripComment(
		locals.db,
		requireTrip(locals).id,
		params.suggestionId,
		params.commentId
	);
