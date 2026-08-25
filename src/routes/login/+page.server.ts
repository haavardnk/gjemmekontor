import { fail, redirect } from '@sveltejs/kit';

import { firstEnabledModulePath } from '$lib/app/modules/activation';
import { getDatabase } from '$lib/app/server/database';
import { createAuthenticatedSession } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { Actions } from './$types';

export const actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const password = form.get('password');
		if (typeof password !== 'string' || !password) {
			return fail(400, { errorMessage: 'Skriv inn passordet.' });
		}
		if (
			!createAuthenticatedSession(password, cookies, {
				db: getDatabase(),
				config: getRuntimeConfig()
			})
		) {
			return fail(401, { errorMessage: 'Passordet er ikke riktig.' });
		}
		redirect(303, firstEnabledModulePath(getRuntimeConfig().enabledModuleIds));
	}
} satisfies Actions;
