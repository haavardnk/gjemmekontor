import { handleNextTripRating } from '$lib/modules/next-trip/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, locals, params }) =>
	handleNextTripRating(request, locals.db, requireTrip(locals).id, params.suggestionId);
