import { handleCreateRecipe } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => handleCreateRecipe(request, locals.db);
