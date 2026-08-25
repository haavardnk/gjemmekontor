import { enabledModuleManifests } from '$lib/app/modules/activation';
import { getRuntimeConfig } from '$lib/server/env';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
	enabledModuleIds: enabledModuleManifests(getRuntimeConfig().enabledModuleIds).map(
		(module) => module.id
	)
});
