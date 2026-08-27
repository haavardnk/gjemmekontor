import { getDatabase } from '$lib/app/server/database';
import { handleActivateRecipe } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleActivateRecipe(request, getDatabase(), locals.trip.id);
};
