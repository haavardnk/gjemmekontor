import type { AppModuleManifest } from '$lib/app/modules/types';

export const gearManifest = {
	id: 'gear',
	label: 'Utstyr',
	icon: 'backpack',
	order: 60,
	mobileNavigation: 'more',
	primaryPath: '/gear',
	pagePrefixes: ['/gear'],
	apiPrefixes: ['/api/gear'],
	cacheableApiPrefixes: [],
	appShellPaths: ['/gear'],
	statePrefixes: ['gear:'],
	requires: []
} as const satisfies AppModuleManifest<'gear'>;
