import {
	handleAddShoppingListItem,
	handleCompleteShoppingListItem,
	handleEditShoppingListItem
} from '$lib/server/bring';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleAddShoppingListItem(request);
export const PATCH: RequestHandler = ({ request }) => handleCompleteShoppingListItem(request);
export const PUT: RequestHandler = ({ request }) => handleEditShoppingListItem(request);
