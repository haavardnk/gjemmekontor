import type { AppModuleManifest } from '$lib/app/modules/types';

export const shoppingListManifest = {
	id: 'shopping-list',
	label: 'Handleliste',
	icon: 'shopping-basket',
	order: 40,
	primaryPath: '/shopping-list',
	pagePrefixes: ['/shopping-list'],
	apiPrefixes: ['/api/shopping-list'],
	cacheableApiPrefixes: [],
	appShellPaths: ['/shopping-list'],
	statePrefixes: [],
	requires: [],
	provides: ['shopping-list.items']
} as const satisfies AppModuleManifest<'shopping-list'>;
