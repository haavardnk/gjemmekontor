import {
	handleAddShoppingListItem,
	handleCompleteShoppingListItem,
	handleEditShoppingListItem
} from '$lib/modules/shopping-list/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleAddShoppingListItem(request);
export const PATCH: RequestHandler = ({ request }) => handleCompleteShoppingListItem(request);
export const PUT: RequestHandler = ({ request }) => handleEditShoppingListItem(request);
