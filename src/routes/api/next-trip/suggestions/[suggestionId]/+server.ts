import { handleDeleteNextTripSuggestion } from '$lib/modules/next-trip/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

const accepted: RequestHandler = () => new Response(null, { status: 204 });

export const PUT = accepted;
export const DELETE: RequestHandler = ({ locals, params }) =>
	handleDeleteNextTripSuggestion(locals.db, requireTrip(locals).id, params.suggestionId);
