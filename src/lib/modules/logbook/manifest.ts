import type { AppModuleManifest } from '$lib/app/modules/types';

export const logbookManifest = {
	id: 'logbook',
	label: 'Loggbok',
	icon: 'book-open',
	order: 30,
	mobileNavigation: 'more',
	primaryPath: '/logbook',
	pagePrefixes: ['/logbook'],
	apiPrefixes: ['/api/logbook'],
	cacheableApiPrefixes: [],
	appShellPaths: ['/logbook'],
	statePrefixes: ['logbook:'],
	requires: [],
	provides: ['logbook.route-overlay'],
	consumes: ['map.location-catalog']
} as const satisfies AppModuleManifest<'logbook'>;
