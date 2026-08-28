import type { AppModuleManifest } from '$lib/app/modules/types';

export const menuManifest = {
	id: 'menu',
	label: 'Meny',
	icon: 'utensils',
	primaryPath: '/menu',
	cacheableApiPrefixes: ['/api/menu/image']
} as const satisfies AppModuleManifest<'menu'>;
