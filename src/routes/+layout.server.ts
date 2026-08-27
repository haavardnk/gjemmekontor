import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	enabledModuleIds: locals.trip?.enabledModuleIds ?? [],
	tripName: locals.trip?.name,
	adminAuthenticated: locals.adminAuthenticated
});
