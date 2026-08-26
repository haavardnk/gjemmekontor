import type { AppModuleManifest } from '$lib/app/modules/types';

export const menuManifest = {
	id: 'menu',
	label: 'Meny',
	icon: 'utensils',
	order: 50,
	mobileNavigation: 'quick',
	primaryPath: '/menu',
	pagePrefixes: ['/menu'],
	apiPrefixes: ['/api/menu'],
	cacheableApiPrefixes: ['/api/menu/image'],
	appShellPaths: ['/menu'],
	statePrefixes: ['menu:archive:', 'menu:active:'],
	requires: [],
	consumes: ['shopping-list.items']
} as const satisfies AppModuleManifest<'menu'>;
