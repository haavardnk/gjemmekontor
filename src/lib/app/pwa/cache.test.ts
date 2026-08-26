import { describe, expect, test } from 'vitest';

import { isApiPath, isAppShellPath, relativeAppPath } from './cache';

describe('PWA cache paths', (): void => {
	test.each([
		['/map', '', '/map'],
		['/trip/map', '/trip', '/map'],
		['/trip', '/trip', '/'],
		['/other/map', '/trip', undefined]
	] as const)('resolves %s under base %s', (pathname, base, expected): void => {
		expect(relativeAppPath(pathname, base)).toBe(expected);
	});

	test.each(['/map', '/shots', '/logbook', '/shopping-list', '/menu', '/gear'])(
		'recognizes shell page %s',
		(pathname): void => {
			expect(isAppShellPath(pathname, '')).toBe(true);
		}
	);

	test('excludes login, APIs, assets, and partial route matches', (): void => {
		expect(isAppShellPath('/login', '')).toBe(false);
		expect(isAppShellPath('/map/details', '')).toBe(false);
		expect(isAppShellPath('/api/map', '')).toBe(false);
		expect(isApiPath('/api', '')).toBe(true);
		expect(isApiPath('/api/state', '')).toBe(true);
		expect(isApiPath('/trip/api/map', '/trip')).toBe(true);
		expect(isApiPath('/trip/map', '/trip')).toBe(false);
	});
});
