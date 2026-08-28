import type { AppModuleManifest } from '$lib/app/modules/types';

export const shotsManifest = {
	id: 'shots',
	label: 'Opptak',
	icon: 'video',
	primaryPath: '/shots',
	api: false,
	statePrefixes: ['shots:', 'digest:']
} as const satisfies AppModuleManifest<'shots'>;
