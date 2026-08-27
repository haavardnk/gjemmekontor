export type ModuleIconName =
	'backpack' | 'book-open' | 'map' | 'scroll-text' | 'shopping-basket' | 'utensils' | 'video';

export type MobileNavigationPlacement = 'quick' | 'more';

export type AppModuleManifest<Id extends string = string> = {
	id: Id;
	label: string;
	icon: ModuleIconName;
	order: number;
	mobileNavigation: MobileNavigationPlacement;
	primaryPath: `/${string}`;
	pagePrefixes: readonly `/${string}`[];
	apiPrefixes: readonly `/api/${string}`[];
	cacheableApiPrefixes?: readonly `/api/${string}`[];
	appShellPaths: readonly `/${string}`[];
	statePrefixes: readonly `${string}:`[];
	requires?: readonly string[];
	provides?: readonly string[];
	consumes?: readonly string[];
};
