import { getDatabase } from '$lib/app/server/database';
import { listRecipeArchive, listTripMenu } from '$lib/modules/menu/server';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	const db = getDatabase();
	return {
		archives: listRecipeArchive(db),
		dishes: listTripMenu(db, locals.trip.id)
	};
};
