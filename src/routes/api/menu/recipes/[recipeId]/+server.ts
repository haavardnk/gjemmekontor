import { getDatabase } from '$lib/app/server/database';
import { handleArchiveRecipe, handleUpdateRecipe } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params }) =>
	handleUpdateRecipe(request, getDatabase(), params.recipeId);

export const DELETE: RequestHandler = ({ params }) =>
	handleArchiveRecipe(getDatabase(), params.recipeId);
