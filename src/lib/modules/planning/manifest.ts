import type { AppModuleManifest } from '$lib/app/modules/types';

export const planningManifest = {
	id: 'planning',
	label: 'Planlegging',
	icon: 'lightbulb',
	primaryPath: '/planning',
	cacheableApiPrefixes: ['/api/planning']
} as const satisfies AppModuleManifest<'planning'>;
