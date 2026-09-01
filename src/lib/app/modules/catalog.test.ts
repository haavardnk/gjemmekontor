import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { moduleCatalog, validateModuleCatalog } from './catalog';

function sourceFiles(directory: string): string[] {
	return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(?:svelte|ts)$/.test(entry.name) ? [path] : [];
	});
}

describe('module catalog', (): void => {
	test('has unique ownership metadata', (): void => {
		expect(() => validateModuleCatalog(moduleCatalog)).not.toThrow();
	});

	test('rejects duplicate state prefixes', (): void => {
		const duplicate = [
			...moduleCatalog,
			{
				...moduleCatalog[1],
				id: 'duplicate',
				primaryPath: '/duplicate'
			} as const
		];

		expect(() => validateModuleCatalog(duplicate)).toThrow('Duplicate module state prefix');
	});

	test('keeps common and trip code independent from product modules', (): void => {
		const files = ['client', 'server', 'trip', 'ui'].flatMap((directory) =>
			sourceFiles(`src/lib/${directory}`)
		);
		for (const file of files) {
			expect(readFileSync(resolve(file), 'utf8'), file).not.toContain('$lib/modules/');
		}
	});

	test('allows sibling module imports only through public entry points', (): void => {
		for (const file of sourceFiles('src/lib/modules')) {
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
