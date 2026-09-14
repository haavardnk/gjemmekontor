import { handleAddNextTripComment } from '$lib/modules/next-trip/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals, params }) =>
	handleAddNextTripComment(request, locals.db, requireTrip(locals).id, params.suggestionId);
