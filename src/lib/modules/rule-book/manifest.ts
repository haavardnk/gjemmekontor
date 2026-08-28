import type { AppModuleManifest } from '$lib/app/modules/types';

export const ruleBookManifest = {
	id: 'rule-book',
	label: 'Regelbok',
	icon: 'scroll-text',
	primaryPath: '/rule-book',
	statePrefixes: ['rule-book:']
} as const satisfies AppModuleManifest<'rule-book'>;
