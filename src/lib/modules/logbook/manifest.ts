import type { AppModuleManifest } from '$lib/app/modules/types';

export const logbookManifest = {
	id: 'logbook',
	label: 'Loggbok',
	icon: 'book-open',
	primaryPath: '/logbook',
	statePrefixes: ['logbook:']
} as const satisfies AppModuleManifest<'logbook'>;
