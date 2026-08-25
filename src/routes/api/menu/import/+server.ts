import { handleImportRecipe } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleImportRecipe(request);
