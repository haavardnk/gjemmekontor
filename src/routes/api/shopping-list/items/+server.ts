import { getDatabase } from '$lib/app/server/database';
import {
	getBringService,
	handleAddShoppingListItem,
	handleCompleteShoppingListItem,
	handleEditShoppingListItem
} from '$lib/modules/shopping-list/server';

import type { RequestHandler } from './$types';

function service(locals: App.Locals) {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return getBringService(getDatabase(), locals.trip.id);
}

export const POST: RequestHandler = ({ request, locals }) =>
	handleAddShoppingListItem(request, service(locals));
export const PATCH: RequestHandler = ({ request, locals }) =>
	handleCompleteShoppingListItem(request, service(locals));
export const PUT: RequestHandler = ({ request, locals }) =>
	handleEditShoppingListItem(request, service(locals));
