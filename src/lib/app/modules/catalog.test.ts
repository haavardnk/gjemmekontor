import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { moduleCatalog, validateModuleCatalog } from './catalog';

describe('module catalog', (): void => {
	test('has unique ownership metadata', (): void => {
		expect(() => validateModuleCatalog(moduleCatalog)).not.toThrow();
	});

	test('keeps primary mobile destinations quick and secondary destinations under More', (): void => {
		expect(
			moduleCatalog
				.filter((module) => module.mobileNavigation === 'quick')
				.map((module) => module.id)
		).toEqual(['map', 'shots', 'shopping-list', 'menu']);
		expect(
			moduleCatalog
				.filter((module) => module.mobileNavigation === 'more')
				.map((module) => module.id)
		).toEqual(['logbook', 'gear']);
	});

	test('rejects duplicate state prefixes', (): void => {
		const duplicate = [
			...moduleCatalog,
			{
				...moduleCatalog[1],
				id: 'duplicate',
				order: 99,
				primaryPath: '/duplicate',
				pagePrefixes: ['/duplicate'],
				appShellPaths: ['/duplicate']
			} as const
		];

		expect(() => validateModuleCatalog(duplicate)).toThrow('Duplicate module state prefix');
	});

	test('keeps common and trip code independent from product modules', (): void => {
		for (const file of [
			'src/lib/client/database.ts',
			'src/lib/client/state.svelte.ts',
			'src/lib/server/database.ts',
			'src/lib/server/state.ts',
			'src/lib/trip/itinerary.ts',
			'src/lib/trip/day.svelte.ts'
		]) {
			expect(readFileSync(resolve(file), 'utf8'), file).not.toContain('$lib/modules/');
		}
	});

	test('allows sibling module imports only through public entry points', (): void => {
		const files = [
			'src/lib/modules/map/ui/MapPage.svelte',
			'src/lib/modules/map/ui/MapView.svelte',
			'src/lib/modules/logbook/domain/map-overlay.ts',
			'src/lib/modules/logbook/ui/LogbookView.svelte',
			'src/lib/modules/menu/domain/shopping.ts',
			'src/lib/modules/menu/server/shopping.ts'
		];
		for (const file of files) {
			const sourceModule = file.split('/')[3];
			const imports = [
				...readFileSync(resolve(file), 'utf8').matchAll(/\$lib\/modules\/([^/'"]+)\/([^'"]+)/g)
			];
			for (const match of imports) {
				const [, targetModule, targetPath] = match;
				if (targetModule !== sourceModule) {
					expect(
						['public', 'server-public'],
						`${file} imports ${targetModule}/${targetPath}`
					).toContain(targetPath);
				}
			}
		}
	});
});
