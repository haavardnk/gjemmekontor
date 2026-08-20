import { describe, expect, test } from 'vitest';

import { parseRuntimeConfig } from './env';

describe('runtime environment', (): void => {
	test('maps valid required variables', (): void => {
		expect(
			parseRuntimeConfig({
				APP_PASSWORD: 'shared-password',
				SESSION_SECRET: '0123456789abcdef0123456789abcdef',
				DATA_DIR: '/data',
				ORIGIN: 'https://gjemmekontor.example.com'
			})
		).toEqual({
			appPassword: 'shared-password',
			sessionSecret: '0123456789abcdef0123456789abcdef',
			dataDir: '/data',
			origin: 'https://gjemmekontor.example.com'
		});
	});

	test('rejects missing and short required variables', (): void => {
		expect(() =>
			parseRuntimeConfig({ APP_PASSWORD: '', SESSION_SECRET: 'short', DATA_DIR: '', ORIGIN: '' })
		).toThrow('Invalid runtime environment: APP_PASSWORD, SESSION_SECRET, DATA_DIR, ORIGIN');
	});

	test('maps only release-tag-derived application versions', (): void => {
		const environment = {
			APP_PASSWORD: 'shared-password',
			SESSION_SECRET: '0123456789abcdef0123456789abcdef',
			DATA_DIR: '/data',
			ORIGIN: 'https://gjemmekontor.example.com'
		};

		expect(parseRuntimeConfig({ ...environment, APP_VERSION: '0.1.0' })).toMatchObject({
			appVersion: '0.1.0'
		});
		expect(parseRuntimeConfig({ ...environment, APP_VERSION: 'unreleased' })).not.toHaveProperty(
			'appVersion'
		);
		expect(() => parseRuntimeConfig({ ...environment, APP_VERSION: 'v0.1.0' })).toThrow(
			'Invalid runtime environment: APP_VERSION'
		);
		expect(() => parseRuntimeConfig({ ...environment, APP_VERSION: '00.1.0' })).toThrow(
			'Invalid runtime environment: APP_VERSION'
		);
	});
});
