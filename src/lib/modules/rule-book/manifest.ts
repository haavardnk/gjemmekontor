import type { AppModuleManifest } from '$lib/app/modules/types';

export const ruleBookManifest = {
	id: 'rule-book',
	label: 'Regelbok',
	icon: 'scroll-text',
	order: 70,
	mobileNavigation: 'more',
	primaryPath: '/rule-book',
	pagePrefixes: ['/rule-book'],
	apiPrefixes: [],
	cacheableApiPrefixes: [],
	appShellPaths: ['/rule-book'],
	statePrefixes: ['rule-book:'],
	requires: []
} as const satisfies AppModuleManifest<'rule-book'>;
