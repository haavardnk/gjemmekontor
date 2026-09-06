import type { AppModuleManifest } from '$lib/app/modules/types';

export const nextTripManifest = {
	id: 'next-trip',
	label: 'Neste tur',
	icon: 'map-pin',
	primaryPath: '/next-trip',
	cacheableApiPrefixes: ['/api/next-trip']
} as const satisfies AppModuleManifest<'next-trip'>;
