import {
	getBringService,
	handleAddShoppingListItem,
	handleCompleteShoppingListItem,
	handleEditShoppingListItem
} from '$lib/modules/shopping-list/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

function service(locals: App.Locals) {
	return getBringService(locals.db, requireTrip(locals).id);
}

export const POST: RequestHandler = ({ request, locals }) =>
	handleAddShoppingListItem(request, service(locals));
export const PATCH: RequestHandler = ({ request, locals }) =>
	handleCompleteShoppingListItem(request, service(locals));
export const PUT: RequestHandler = ({ request, locals }) =>
	handleEditShoppingListItem(request, service(locals));
