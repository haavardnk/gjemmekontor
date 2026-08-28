export type ModuleIconName =
	'backpack' | 'book-open' | 'map' | 'scroll-text' | 'shopping-basket' | 'utensils' | 'video';

export type AppModuleManifest<Id extends string = string> = {
	id: Id;
	label: string;
	icon: ModuleIconName;
	primaryPath: `/${string}`;
	api?: false;
	cacheableApiPrefixes?: readonly `/api/${string}`[];
	statePrefixes?: readonly `${string}:`[];
};
