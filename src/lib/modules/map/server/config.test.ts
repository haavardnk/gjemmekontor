import { describe, expect, test } from 'vitest';

import { parseMapRuntimeConfig } from './config';

describe('Map runtime configuration', (): void => {
	test('maps required and optional values', (): void => {
		expect(
			parseMapRuntimeConfig(
				{
					AISSTREAM_API_KEY: 'ais-key',
					BUNDLED_OFFLINE_MAP_DIR: '/app/offline'
				},
				'/data'
			)
		).toEqual({
			aisStreamApiKey: 'ais-key',
			dataDir: '/data',
			bundledOfflineMapDir: '/app/offline',
			tripadvisorTerraPhotosEnabled: false,
			tripadvisorCacheDays: 30
		});
	});

	test('maps optional POI enrichment configuration', (): void => {
		expect(
			parseMapRuntimeConfig(
				{
					AISSTREAM_API_KEY: 'ais-key',
					GOOGLE_PLACES_SERVER_API_KEY: 'server-key',
					GOOGLE_PLACES_UI_KIT_API_KEY: 'ui-key',
					TRIPADVISOR_TERRA_API_KEY: 'tripadvisor-key',
					TRIPADVISOR_TERRA_PHOTOS_ENABLED: 'true',
					TRIPADVISOR_CACHE_DAYS: '45'
				},
				'/data'
			)
		).toMatchObject({
			googlePlacesServerApiKey: 'server-key',
			googlePlacesUiKitApiKey: 'ui-key',
			tripadvisorTerraApiKey: 'tripadvisor-key',
			tripadvisorTerraPhotosEnabled: true,
			tripadvisorCacheDays: 45
		});
	});

	test('allows optional providers to be disabled globally', (): void => {
		expect(parseMapRuntimeConfig({}, '/data')).toEqual({
			dataDir: '/data',
			tripadvisorTerraPhotosEnabled: false,
			tripadvisorCacheDays: 30
		});
	});
});
