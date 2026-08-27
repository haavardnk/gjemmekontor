import { fail, redirect } from '@sveltejs/kit';

import { getDatabase } from '$lib/app/server/database';
import { authenticateAdmin } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.adminAuthenticated) redirect(303, '/admin/trips');
	return {};
};

export const actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const password = (await request.formData()).get('password');
		if (typeof password !== 'string' || !password) {
			return fail(400, { errorMessage: 'Skriv inn administratorpassordet.' });
		}
		const result = authenticateAdmin(password, getClientAddress(), cookies, {
			db: getDatabase(),
			config: getRuntimeConfig()
		});
		if (result === 'rate_limited') {
			return fail(429, { errorMessage: 'For mange forsøk. Vent litt og prøv igjen.' });
		}
		if (result !== 'authenticated') {
			return fail(401, { errorMessage: 'Administratorpassordet er ikke riktig.' });
		}
		redirect(303, '/admin/trips');
	}
} satisfies Actions;
