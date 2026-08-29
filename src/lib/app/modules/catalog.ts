import { gearManifest } from '$lib/modules/gear/manifest';
import { itineraryManifest } from '$lib/modules/itinerary/manifest';
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
	itineraryManifest,
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

function hasApi(module: AppModuleManifest): boolean {
	return module.api !== false;
}

function statePrefixes(module: AppModuleManifest): readonly string[] {
	return module.statePrefixes ?? [];
}

function cacheableApiPrefixes(module: AppModuleManifest): readonly string[] {
	return module.cacheableApiPrefixes ?? [];
}

export function moduleForPagePath(pathname: string): (typeof moduleCatalog)[number] | undefined {
	return moduleCatalog.find((module) => pathMatchesPrefix(pathname, module.primaryPath));
}

export function moduleForApiPath(pathname: string): (typeof moduleCatalog)[number] | undefined {
	return moduleCatalog.find(
		(module) => hasApi(module) && pathMatchesPrefix(pathname, `/api/${module.id}`)
	);
}

export function moduleForStateKey(key: string): (typeof moduleCatalog)[number] | undefined {
	return moduleCatalog.find((module) =>
		statePrefixes(module).some((prefix) => key.startsWith(prefix))
	);
}

export function isCacheableModuleApi(pathname: string): boolean {
	const module = moduleForApiPath(pathname);
	return Boolean(
		module &&
		cacheableApiPrefixes(module).some((prefix) =>
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
		'primary path',
		catalog.map((module) => module.primaryPath)
	);
	uniqueValues(
		'state prefix',
		catalog.flatMap((module) => module.statePrefixes ?? [])
	);
}

validateModuleCatalog();
