import type { AppModuleManifest } from '$lib/app/modules/types';

export const shoppingListManifest = {
	id: 'shopping-list',
	label: 'Handleliste',
	icon: 'shopping-basket',
	primaryPath: '/shopping-list'
} as const satisfies AppModuleManifest<'shopping-list'>;
