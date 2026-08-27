import { describe, expect, test } from 'vitest';

import {
	enabledModuleManifests,
	firstEnabledModulePath,
	resolveEnabledModuleIds
} from './activation';

describe('module activation', (): void => {
	test('enables every bundled module by default in navigation order', (): void => {
		expect(resolveEnabledModuleIds()).toEqual([
			'map',
			'shots',
			'logbook',
			'shopping-list',
			'menu',
			'gear',
			'rule-book'
		]);
	});

	test('preserves each trip module order', (): void => {
		expect(resolveEnabledModuleIds(['shopping-list', 'shots'])).toEqual(['shopping-list', 'shots']);
		expect(firstEnabledModulePath(['shopping-list', 'shots'])).toBe('/shopping-list');
	});

	test('returns only enabled manifests and shell paths', (): void => {
		expect(enabledModuleManifests(['logbook']).flatMap((module) => module.appShellPaths)).toEqual([
			'/logbook'
		]);
	});

	test.each([
		[[], 'At least one module must be enabled'],
		[['unknown'], 'Unknown enabled module: unknown'],
		[['map', 'map'], 'Duplicate enabled module: map']
	] as const)('rejects invalid configuration %#', (configured, message): void => {
		expect(() => resolveEnabledModuleIds(configured)).toThrow(message);
	});
});
