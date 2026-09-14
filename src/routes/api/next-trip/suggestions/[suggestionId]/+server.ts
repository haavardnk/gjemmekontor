import {
	handleDeleteNextTripSuggestion,
	handleUpdateNextTripSuggestion
} from '$lib/modules/next-trip/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

const accepted: RequestHandler = () => new Response(null, { status: 204 });

export const PUT = accepted;
export const PATCH: RequestHandler = ({ request, locals, params }) =>
	handleUpdateNextTripSuggestion(request, locals.db, requireTrip(locals).id, params.suggestionId);
export const DELETE: RequestHandler = ({ locals, params }) =>
	handleDeleteNextTripSuggestion(locals.db, requireTrip(locals).id, params.suggestionId);
