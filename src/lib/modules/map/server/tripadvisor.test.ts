import { describe, expect, test, vi } from 'vitest';

import type { MapFeature, MapSourceStyleLegend } from '$lib/modules/map/domain/types';

import { createTripadvisorAdapter } from './tripadvisor';

const feature: MapFeature = {
	type: 'Feature',
	id: 'a'.repeat(64),
	geometry: { type: 'Point', coordinates: [16.2, 43.2] },
	properties: {
		title: 'Konoba Test',
		description: '',
		snippet: '',
		address: '',
		layerId: 'layer',
		layerName: 'Layer',
		layerPath: ['Layer'],
		extendedData: {},
		style: { iconCode: '1577' }
	}
};
const sourceStyles: MapSourceStyleLegend[] = [];

describe('Tripadvisor adapter', (): void => {
	test('chooses a close unambiguous normalized name match', async (): Promise<void> => {
		const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
			Response.json({
				data: [
					{
						location: {
							id: 123,
							names: [{ value: 'Konoba Test', primary: true }],
							coordinates: { latitude: 43.2001, longitude: 16.2001 },
							overall_rating: { rating: 4.5, count: 42 },
							urls: {
								tripadvisor: { main: 'https://www.tripadvisor.com/test' }
							}
						}
					},
					{
						location: {
							id: 456,
							names: [{ value: 'Unrelated Restaurant' }],
							coordinates: { latitude: 43.21, longitude: 16.21 }
						}
					}
				],
				pagination: { page: 1, size: 2 }
			})
		);
		const adapter = createTripadvisorAdapter('trip-key', fetchImplementation);

		expect(await adapter.searchId(feature, sourceStyles)).toBe('123');
		expect(await adapter.details('123')).toMatchObject({
			locationId: '123',
			rating: 4.5,
			reviewCount: 42,
			webUrl: 'https://www.tripadvisor.com/test'
		});
		const url = new URL(String(fetchImplementation.mock.calls[0]?.[0]));
		expect(url.pathname).toBe('/api/catalog/locations/nearby');
		expect(url.searchParams.get('category')).toBe('RESTAURANT');
		expect(url.searchParams.get('lat')).toBe('43.2');
		expect(url.searchParams.get('lon')).toBe('16.2');
		expect(new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers).get('x-api-key')).toBe(
			'trip-key'
		);
		expect(fetchImplementation).toHaveBeenCalledTimes(1);
	});

	test('normalizes details and limits photos to five', async (): Promise<void> => {
		const photos = Array.from({ length: 6 }, (_, index) => ({
			caption: `Photo ${index}`,
			photo: {
				original_size_url: `https://dynamic-media-cdn.tripadvisor.com/${index}-large.jpg`
			},
			source: { name: 'Traveler' },
			user: { username: `User ${index}` }
		}));
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({
					id: 123,
					names: [{ value: 'Konoba Test', primary: true }],
					overall_rating: { rating: '4.5', count: '42' },
					urls: {
						tripadvisor: {
							main: 'https://www.tripadvisor.com/test',
							photos: 'https://www.tripadvisor.com/test/photos'
						}
					}
				})
			)
			.mockResolvedValueOnce(Response.json({ data: photos.slice(0, 5), pagination: {} }));
		const adapter = createTripadvisorAdapter('trip-key', fetchImplementation);

		expect(await adapter.details('123')).toMatchObject({
			locationId: '123',
			rating: 4.5,
			reviewCount: 42
		});
		expect(await adapter.photos('123', 'https://www.tripadvisor.com/test/photos')).toHaveLength(5);
	});

	test('matches numbered destinations by their provider name', async (): Promise<void> => {
		const numberedFeature = structuredClone(feature);
		numberedFeature.properties.title = '4 Blue lagoon anchorage';
		numberedFeature.properties.layerPath = ['Dag 1 - Lørdag'];
		numberedFeature.properties.style.iconCode = '1623';
		const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
			Response.json({
				data: [
					{
						location: {
							id: 123,
							names: [{ value: 'Blue Lagoon Anchorage', primary: true }],
							coordinates: { latitude: 43.2001, longitude: 16.2001 }
						}
					}
				]
			})
		);
		const adapter = createTripadvisorAdapter('trip-key', fetchImplementation);

		expect(await adapter.searchId(numberedFeature, sourceStyles)).toBe('123');
	});
});
