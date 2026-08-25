import { handleGetShoppingList } from '$lib/modules/shopping-list/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => handleGetShoppingList();
