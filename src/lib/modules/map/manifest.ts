import type { AppModuleManifest } from '$lib/app/modules/types';

export const mapManifest = {
	id: 'map',
	label: 'Kart',
	icon: 'map',
	primaryPath: '/map',
	cacheableApiPrefixes: [
		'/api/map/offline/',
		'/api/map/depth-contours/',
		'/api/map/marine-profile/'
	]
} as const satisfies AppModuleManifest<'map'>;
