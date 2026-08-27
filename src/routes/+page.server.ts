import { redirect } from '@sveltejs/kit';

import { firstEnabledModulePath } from '$lib/app/modules/activation';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.trip || !locals.tripAuthenticated || locals.trip.enabledModuleIds.length === 0) {
		redirect(303, '/trips');
	}
	redirect(303, firstEnabledModulePath(locals.trip.enabledModuleIds));
};
