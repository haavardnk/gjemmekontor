import type { AppModuleManifest } from '$lib/app/modules/types';

export const shotsManifest = {
	id: 'shots',
	label: 'Opptak',
	icon: 'video',
	order: 20,
	mobileNavigation: 'quick',
	primaryPath: '/shots',
	pagePrefixes: ['/shots'],
	apiPrefixes: [],
	cacheableApiPrefixes: [],
	appShellPaths: ['/shots'],
	statePrefixes: ['shots:', 'digest:'],
	requires: []
} as const satisfies AppModuleManifest<'shots'>;
