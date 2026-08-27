import { getDatabase } from '$lib/app/server/database';
import { handleMenuShoppingApply } from '$lib/modules/menu/server';
import { getBringService } from '$lib/modules/shopping-list/server-public';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleMenuShoppingApply(
		request,
		getDatabase(),
		locals.trip.id,
		getBringService(getDatabase(), locals.trip.id),
		undefined,
		locals.trip.enabledModuleIds.includes('shopping-list')
	);
};
