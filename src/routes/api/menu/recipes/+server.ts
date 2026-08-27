import { getDatabase } from '$lib/app/server/database';
import { handleCreateRecipe } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleCreateRecipe(request, getDatabase());
