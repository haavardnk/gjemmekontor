import { getDatabase } from '$lib/app/server/database';
import { handleMenuShoppingPreview } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleMenuShoppingPreview(
		request,
		getDatabase(),
		locals.trip.id,
		undefined,
		locals.trip.enabledModuleIds.includes('shopping-list')
	);
};
