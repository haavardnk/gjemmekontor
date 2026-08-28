import { loadTripMapConfig } from '$lib/modules/map/server/config';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const config = loadTripMapConfig(locals.db, requireTrip(locals).id);
	return {
		defaultMode: config.defaultMode,
		enabledOverlays: config.enabledOverlays
	};
};
