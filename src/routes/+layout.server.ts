import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	enabledModuleIds: locals.trip?.enabledModuleIds ?? [],
	tripId: locals.trip?.id,
	tripName: locals.trip?.name,
	adminAuthenticated: locals.adminAuthenticated
});
