import { gearManifest } from '$lib/modules/gear/manifest';
import { logbookManifest } from '$lib/modules/logbook/manifest';
import { mapManifest } from '$lib/modules/map/manifest';
import { menuManifest } from '$lib/modules/menu/manifest';
import { ruleBookManifest } from '$lib/modules/rule-book/manifest';
import { shoppingListManifest } from '$lib/modules/shopping-list/manifest';
import { shotsManifest } from '$lib/modules/shots/manifest';

import type { AppModuleManifest } from './types';

export const moduleCatalog = [
	mapManifest,
	shotsManifest,
	logbookManifest,
	shoppingListManifest,
	menuManifest,
	gearManifest,
	ruleBookManifest
] as const satisfies readonly AppModuleManifest[];

export type ModuleId = (typeof moduleCatalog)[number]['id'];

export const defaultModuleIds: readonly ModuleId[] = moduleCatalog.map((module) => module.id);

export function isModuleId(value: string): value is ModuleId {
	return moduleCatalog.some((module) => module.id === value);
}

export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function moduleForPagePath(pathname: string): (typeof moduleCatalog)[number] | undefined {
	return moduleCatalog.find((module) =>
		module.pagePrefixes.some((prefix) => pathMatchesPrefix(pathname, prefix))
	);
}

export function moduleForApiPath(pathname: string): (typeof moduleCatalog)[number] | undefined {
	return moduleCatalog.find((module) =>
		module.apiPrefixes.some((prefix) => pathMatchesPrefix(pathname, prefix))
	);
}

export function moduleForStateKey(key: string): (typeof moduleCatalog)[number] | undefined {
	return moduleCatalog.find((module) =>
		module.statePrefixes.some((prefix) => key.startsWith(prefix))
	);
}

export function isCacheableModuleApi(pathname: string): boolean {
	const module = moduleForApiPath(pathname);
	return Boolean(
		module?.cacheableApiPrefixes?.some((prefix) =>
			prefix.endsWith('/') ? pathname.startsWith(prefix) : pathMatchesPrefix(pathname, prefix)
		)
	);
}

export function validateModuleCatalog(catalog: readonly AppModuleManifest[] = moduleCatalog): void {
	const uniqueValues = (label: string, values: readonly string[]): void => {
		if (new Set(values).size !== values.length) {
			throw new Error(`Duplicate module ${label}`);
		}
	};

	uniqueValues(
		'ID',
		catalog.map((module) => module.id)
	);
	uniqueValues(
		'navigation order',
		catalog.map((module) => String(module.order))
	);
	uniqueValues(
		'primary path',
		catalog.map((module) => module.primaryPath)
	);
	uniqueValues(
		'page prefix',
		catalog.flatMap((module) => module.pagePrefixes)
	);
	uniqueValues(
		'API prefix',
		catalog.flatMap((module) => module.apiPrefixes)
	);
	uniqueValues(
		'app shell path',
		catalog.flatMap((module) => module.appShellPaths)
	);
	uniqueValues(
		'state prefix',
		catalog.flatMap((module) => module.statePrefixes)
	);

	for (const module of catalog) {
		if (!module.pagePrefixes.includes(module.primaryPath)) {
			throw new Error(`Module ${module.id} does not own its primary path`);
		}
	}
}

validateModuleCatalog();
