import { error, fail, redirect } from '@sveltejs/kit';

import { firstTripModulePath, getTripBySlug } from '$lib/app/server/trips';
import { authenticateTrip, rememberTrip } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const trip = getTripBySlug(locals.db, params.tripSlug);
	if (!trip) error(404, 'TRIP_NOT_FOUND');
	if (locals.tripAuthenticated && locals.trip?.id === trip.id) {
		const path = firstTripModulePath(trip);
		if (path) redirect(303, path);
	}
	return { trip, adminAuthenticated: locals.adminAuthenticated };
};

export const actions = {
	default: async ({ request, params, cookies, getClientAddress, locals }) => {
		const trip = getTripBySlug(locals.db, params.tripSlug);
		if (!trip) error(404, 'TRIP_NOT_FOUND');
		if (trip.setupRequired) return fail(409, { errorMessage: 'Reisen må settes opp først.' });

		const password = (await request.formData()).get('password');
		if (typeof password !== 'string' || !password) {
			return fail(400, { errorMessage: 'Skriv inn reisepassordet.' });
		}
		const config = getRuntimeConfig();
		const result = authenticateTrip(trip.id, password, getClientAddress(), cookies, {
			db: locals.db,
			config
		});
		if (result === 'rate_limited') {
			return fail(429, { errorMessage: 'For mange forsøk. Vent litt og prøv igjen.' });
		}
		if (result !== 'authenticated') {
			return fail(401, { errorMessage: 'Reisepassordet er ikke riktig.' });
		}
		rememberTrip(cookies, trip.slug, config);
		const path = firstTripModulePath(trip);
		if (!path) return fail(409, { errorMessage: 'Reisen har ingen aktive moduler.' });
		redirect(303, path);
	}
} satisfies Actions;
