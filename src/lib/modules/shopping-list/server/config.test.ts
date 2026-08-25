import { describe, expect, test } from 'vitest';

import { parseBringConfig } from './config';

describe('Shopping List runtime configuration', (): void => {
	test('maps a complete Bring configuration', (): void => {
		expect(
			parseBringConfig({
				BRING_EMAIL: 'crew@example.com',
				BRING_PASSWORD: 'bring-password',
				BRING_LIST_UUID: 'trip-list'
			})
		).toEqual({
			email: 'crew@example.com',
			password: 'bring-password',
			listUuid: 'trip-list'
		});
	});

	test('allows an unconfigured optional provider', (): void => {
		expect(parseBringConfig({})).toBeUndefined();
	});

	test('rejects a partial Bring configuration', (): void => {
		expect(() => parseBringConfig({ BRING_EMAIL: 'crew@example.com' })).toThrow(
			'Invalid Shopping List environment: BRING_PASSWORD, BRING_LIST_UUID'
		);
	});
});
