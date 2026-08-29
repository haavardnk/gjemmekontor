import type { AppModuleManifest } from '$lib/app/modules/types';

export const itineraryManifest = {
	id: 'itinerary',
	label: 'Reiseplan',
	icon: 'route',
	primaryPath: '/itinerary',
	statePrefixes: ['itinerary:']
} as const satisfies AppModuleManifest<'itinerary'>;
