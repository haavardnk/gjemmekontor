import { handleActivateRecipe } from '$lib/modules/menu/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	return handleActivateRecipe(request, locals.db, requireTrip(locals).id);
};
