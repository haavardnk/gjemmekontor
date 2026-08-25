export type ModuleIconName = 'book-open' | 'map' | 'shopping-basket' | 'video';

export type AppModuleManifest<Id extends string = string> = {
	id: Id;
	label: string;
	icon: ModuleIconName;
	order: number;
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
