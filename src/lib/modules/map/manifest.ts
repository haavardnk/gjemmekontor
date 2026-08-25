import type { AppModuleManifest } from '$lib/app/modules/types';

export const mapManifest = {
	id: 'map',
	label: 'Kart',
	icon: 'map',
	order: 10,
	primaryPath: '/map',
	pagePrefixes: ['/map'],
	apiPrefixes: ['/api/map'],
	cacheableApiPrefixes: [
		'/api/map/offline/',
		'/api/map/depth-contours/',
		'/api/map/marine-profile/'
	],
	appShellPaths: ['/map'],
	statePrefixes: [],
	requires: [],
	provides: ['map.location-catalog'],
	consumes: ['logbook.route-overlay']
} as const satisfies AppModuleManifest<'map'>;
