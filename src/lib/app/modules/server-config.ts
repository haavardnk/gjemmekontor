import { getMapRuntimeConfig } from '$lib/modules/map/server/config';
import { getBringCredentials } from '$lib/modules/shopping-list/server/config';

import type { ModuleId } from './catalog';

export function validateEnabledModuleConfiguration(enabledModuleIds: readonly ModuleId[]): void {
	const enabled = new Set(enabledModuleIds);
	if (enabled.has('map')) getMapRuntimeConfig();
	if (enabled.has('shopping-list')) getBringCredentials();
}
