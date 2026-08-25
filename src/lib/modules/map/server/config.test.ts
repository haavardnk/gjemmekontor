import { describe, expect, test } from 'vitest';

import { parseMapRuntimeConfig } from './config';

describe('Map runtime configuration', (): void => {
	test('maps required and optional values', (): void => {
		expect(
			parseMapRuntimeConfig(
				{ GOOGLE_MY_MAPS_ID: 'map-id', BUNDLED_OFFLINE_MAP_DIR: '/app/offline' },
				'/data'
			)
		).toEqual({
			dataDir: '/data',
			googleMyMapsId: 'map-id',
			bundledOfflineMapDir: '/app/offline'
		});
	});

	test('rejects a missing map ID only when Map configuration is requested', (): void => {
		expect(() => parseMapRuntimeConfig({}, '/data')).toThrow(
			'Invalid Map environment: GOOGLE_MY_MAPS_ID'
		);
	});
});
