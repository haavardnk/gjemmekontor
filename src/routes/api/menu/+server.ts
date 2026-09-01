import { listRecipeArchive, listTripMenu } from '$lib/modules/menu/server';
import { apiSuccess } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const trip = requireTrip(locals);
	return apiSuccess({
		archives: listRecipeArchive(locals.db),
		dishes: listTripMenu(locals.db, trip.id)
	});
};
