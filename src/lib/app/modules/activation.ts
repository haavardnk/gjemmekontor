import { defaultModuleIds, isModuleId, moduleCatalog, type ModuleId } from './catalog';

export function resolveEnabledModuleIds(configured?: readonly string[]): ModuleId[] {
	const requested = configured ?? defaultModuleIds;
	if (requested.length === 0) {
		throw new Error('At least one module must be enabled');
	}

	const unique = new Set<string>();
	for (const id of requested) {
		if (!isModuleId(id)) {
			throw new Error(`Unknown enabled module: ${id}`);
		}
		if (unique.has(id)) {
			throw new Error(`Duplicate enabled module: ${id}`);
		}
		unique.add(id);
	}

	for (const module of moduleCatalog) {
		if (!unique.has(module.id)) continue;
		for (const required of module.requires ?? []) {
			if (!unique.has(required)) {
				throw new Error(`Enabled module ${module.id} requires ${required}`);
			}
		}
	}

	return moduleCatalog.filter((module) => unique.has(module.id)).map((module) => module.id);
}

export function enabledModuleManifests(configured?: readonly string[]) {
	const enabled = new Set(resolveEnabledModuleIds(configured));
	return moduleCatalog.filter((module) => enabled.has(module.id));
}

export function firstEnabledModulePath(configured?: readonly string[]): string {
	const first = enabledModuleManifests(configured)[0];
	if (!first) throw new Error('At least one module must be enabled');
	return first.primaryPath;
}
