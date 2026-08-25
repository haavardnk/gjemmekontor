import { describe, expect, test } from 'vitest';

import {
	isPublicAddress,
	pinnedLookupResult,
	RemoteFetchError,
	validateRemoteUrl
} from './remote-fetch';

describe('Menu remote fetch validation', (): void => {
	test.each([
		'127.0.0.1',
		'10.0.0.1',
		'169.254.1.1',
		'192.0.2.1',
		'::1',
		'fc00::1',
		'fe80::1',
		'ff02::1',
		'::ffff:127.0.0.1'
	])('rejects non-public address %s', (address): void => {
		expect(isPublicAddress(address)).toBe(false);
	});

	test.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
		'allows public address %s',
		(address): void => {
			expect(isPublicAddress(address)).toBe(true);
		}
	);

	test.each([
		'http://example.com/recipe',
		'https://user:password@example.com/recipe',
		'https://example.com:444/recipe',
		'https://localhost/recipe',
		'https://printer.local/recipe'
	])('rejects unsafe URL %s', (url): void => {
		expect(() => validateRemoteUrl(url)).toThrow(RemoteFetchError);
	});

	test('returns the Node 26 lookup array shape when all addresses are requested', (): void => {
		expect(pinnedLookupResult('203.0.113.10', 4, true)).toEqual([
			{ address: '203.0.113.10', family: 4 }
		]);
		expect(pinnedLookupResult('203.0.113.10', 4, false)).toEqual({
			address: '203.0.113.10',
			family: 4
		});
	});
});
