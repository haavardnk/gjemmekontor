import { describe, expect, test } from 'vitest';

import {
	googlePlaceIdOverride,
	isPoiEnrichmentEligible,
	mapFeatureSymbol,
	providerSearchTitle,
	tripadvisorLocationIdOverride,
	tripadvisorPhotoSchema
} from './enrichment';
import type { MapFeature, MapSourceStyleLegend } from './types';

function feature(symbolCode = '1577'): MapFeature {
	return {
		type: 'Feature',
		id: 'a'.repeat(64),
		geometry: { type: 'Point', coordinates: [16.2, 43.2] },
		properties: {
			title: 'Restaurant Test',
			description: '',
			snippet: '',
			address: '',
			layerId: 'layer',
			layerName: 'Layer',
			layerPath: ['Layer'],
			extendedData: {},
			style: { iconCode: symbolCode }
		}
	};
}

describe('POI enrichment domain', (): void => {
	test.each(['1577', '1623', '1563', '1899'])(
		'enables enrichment for point category %s',
		(symbolCode): void => {
			expect(isPoiEnrichmentEligible(feature(symbolCode))).toBe(true);
		}
	);

	test('rejects non-point geometry', (): void => {
		const route = feature();
		route.geometry = {
			type: 'LineString',
			coordinates: [
				[16.2, 43.2],
				[16.3, 43.3]
			]
		};
		expect(isPoiEnrichmentEligible(route)).toBe(false);
	});

	test('prefers the current source-style symbol', (): void => {
		const candidate = feature('1623');
		candidate.properties.sourceStyleKey = 'source-style-restaurant';
		const sourceStyle = {
			key: 'source-style-restaurant',
			color: '#000000',
			iconHref: '',
			iconCode: '1577',
			symbol: 'restaurant',
			label: 'Restauranter',
			count: 1
		} satisfies MapSourceStyleLegend;
		expect(mapFeatureSymbol(candidate, [sourceStyle])).toBe('restaurant');
	});

	test('removes a leading number only for destination-folder provider searches', (): void => {
		const candidate = feature('1623');
		candidate.properties.title = '4 - Blue lagoon anchorage';
		candidate.properties.layerPath = ['Dag 1 - Lørdag'];
		expect(providerSearchTitle(candidate)).toBe('Blue lagoon anchorage');
		candidate.properties.style.iconCode = '1577';
		expect(providerSearchTitle(candidate)).toBe('4 - Blue lagoon anchorage');
	});

	test('reads strict case-insensitive manual provider IDs', (): void => {
		const candidate = feature();
		candidate.properties.extendedData = {
			Google_Place_ID: 'ChIJ1234567890_test',
			TRIPADVISOR_LOCATION_ID: '123456'
		};
		expect(googlePlaceIdOverride(candidate)).toBe('ChIJ1234567890_test');
		expect(tripadvisorLocationIdOverride(candidate)).toBe('123456');
		candidate.properties.extendedData.Google_Place_ID = '<b>invalid</b>';
		expect(googlePlaceIdOverride(candidate)).toBeUndefined();
	});

	test('accepts only Tripadvisor-owned provider links and media', (): void => {
		expect(
			tripadvisorPhotoSchema.safeParse({
				thumbnailUrl: 'https://dynamic-media-cdn.tripadvisor.com/thumb.jpg',
				imageUrl: 'https://media-cdn.tripadvisor.com/large.jpg',
				linkUrl: 'https://www.tripadvisor.com/test/photos'
			}).success
		).toBe(true);
		expect(
			tripadvisorPhotoSchema.safeParse({
				thumbnailUrl: 'https://tripadvisor.com.attacker.example/thumb.jpg',
				imageUrl: 'https://dynamic-media-cdn.tripadvisor.com/large.jpg'
			}).success
		).toBe(false);
	});
});
