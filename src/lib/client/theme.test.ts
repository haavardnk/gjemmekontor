import { describe, expect, test } from 'vitest';

import { resolveTheme } from './theme.svelte';

describe('color theme', (): void => {
	test.each([
		['light', true, 'light'],
		['dark', false, 'dark'],
		[null, false, 'light'],
		[null, true, 'dark'],
		['unknown', true, 'dark']
	] as const)(
		'resolves stored %s with dark preference %s',
		(stored, prefersDark, expected): void => {
			expect(resolveTheme(stored, prefersDark)).toBe(expected);
		}
	);
});
