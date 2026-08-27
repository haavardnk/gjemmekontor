import { describe, expect, test } from 'vitest';

import { parseBringCredentials } from './config';

describe('Shopping List runtime configuration', (): void => {
	test('maps the shared Bring credentials', (): void => {
		expect(
			parseBringCredentials({
				BRING_EMAIL: 'crew@example.com',
				BRING_PASSWORD: 'bring-password'
			})
		).toEqual({
			email: 'crew@example.com',
			password: 'bring-password'
		});
	});

	test('allows an unconfigured optional provider', (): void => {
		expect(parseBringCredentials({})).toBeUndefined();
	});

	test('rejects a partial Bring configuration', (): void => {
		expect(() => parseBringCredentials({ BRING_EMAIL: 'crew@example.com' })).toThrow(
			'Invalid Shopping List environment: BRING_PASSWORD'
		);
	});
});
