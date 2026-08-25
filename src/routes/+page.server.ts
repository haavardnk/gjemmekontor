import { redirect } from '@sveltejs/kit';

import { firstEnabledModulePath } from '$lib/app/modules/activation';
import { getRuntimeConfig } from '$lib/server/env';

export function load(): never {
	redirect(303, firstEnabledModulePath(getRuntimeConfig().enabledModuleIds));
}
