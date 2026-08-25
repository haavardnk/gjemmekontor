import { describe, expect, test } from 'vitest';

import { parseMapRuntimeConfig } from './config';

describe('Map runtime configuration', (): void => {
	test('maps required and optional values', (): void => {
		expect(
			parseMapRuntimeConfig(
				{
					AISSTREAM_API_KEY: 'ais-key',
					GOOGLE_MY_MAPS_ID: 'map-id',
					BUNDLED_OFFLINE_MAP_DIR: '/app/offline'
				},
				'/data'
			)
		).toEqual({
			aisStreamApiKey: 'ais-key',
			dataDir: '/data',
			googleMyMapsId: 'map-id',
			bundledOfflineMapDir: '/app/offline'
		});
	});

	test('rejects missing Map credentials only when Map configuration is requested', (): void => {
		expect(() => parseMapRuntimeConfig({}, '/data')).toThrow(
			'Invalid Map environment: AISSTREAM_API_KEY, GOOGLE_MY_MAPS_ID'
		);
	});
});
