import { listRecipeArchive, listTripMenu } from '$lib/modules/menu/server';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const trip = requireTrip(locals);
	return {
		archives: listRecipeArchive(locals.db),
		dishes: listTripMenu(locals.db, trip.id)
	};
};
