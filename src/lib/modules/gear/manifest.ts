import type { AppModuleManifest } from '$lib/app/modules/types';

export const gearManifest = {
	id: 'gear',
	label: 'Utstyr',
	icon: 'backpack',
	primaryPath: '/gear'
} as const satisfies AppModuleManifest<'gear'>;
