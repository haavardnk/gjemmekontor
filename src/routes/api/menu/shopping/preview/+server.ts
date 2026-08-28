import { handleMenuShoppingPreview } from '$lib/modules/menu/server';
import { getBringService } from '$lib/modules/shopping-list/server-public';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	const trip = requireTrip(locals);
	return handleMenuShoppingPreview(
		request,
		locals.db,
		trip.id,
		getBringService(locals.db, trip.id),
		trip.enabledModuleIds.includes('shopping-list')
	);
};
