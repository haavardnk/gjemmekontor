import { handleArchiveRecipe, handleUpdateRecipe } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params, locals }) =>
	handleUpdateRecipe(request, locals.db, params.recipeId);

export const DELETE: RequestHandler = ({ params, locals }) =>
	handleArchiveRecipe(locals.db, params.recipeId);
