import { getDatabase } from '$lib/app/server/database';
import { listTripDays } from '$lib/app/server/trip-days';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const db = locals.trip ? getDatabase() : undefined;
	const tripDetails = locals.trip
		? (db?.prepare('SELECT timezone FROM trips WHERE id = ?').get(locals.trip.id) as
				{ timezone: string } | undefined)
		: undefined;
	return {
		enabledModuleIds: locals.trip?.enabledModuleIds ?? [],
		tripId: locals.trip?.id,
		tripName: locals.trip?.name,
		tripDays: locals.trip && db ? listTripDays(db, locals.trip.id) : [],
		tripTimezone: tripDetails?.timezone,
		adminAuthenticated: locals.adminAuthenticated
	};
};
