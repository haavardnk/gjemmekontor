import { describe, expect, test, vi } from 'vitest';

import type { MapFeature } from '$lib/modules/map/domain/types';

import { createGooglePlacesAdapter } from './google-places';

const feature: MapFeature = {
	type: 'Feature',
	id: 'a'.repeat(64),
	geometry: { type: 'Point', coordinates: [16.2, 43.2] },
	properties: {
		title: 'Konoba Test',
		description: '',
		snippet: '',
		address: 'Split, Croatia',
		layerId: 'layer',
		layerName: 'Layer',
		layerPath: ['Layer'],
		extendedData: {},
		style: { iconCode: '1577' }
	}
};

describe('Google Places ID adapter', (): void => {
	test('uses ID-only text search with one coordinate-biased result', async (): Promise<void> => {
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ places: [{ id: 'ChIJ1234567890_test' }] }));
		const adapter = createGooglePlacesAdapter('server-key', fetchImplementation);

		expect(await adapter.searchId(feature)).toBe('ChIJ1234567890_test');
		const [url, options] = fetchImplementation.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
		expect(new Headers(options.headers).get('X-Goog-FieldMask')).toBe('places.id');
		expect(new Headers(options.headers).get('X-Goog-Api-Key')).toBe('server-key');
		expect(JSON.parse(String(options.body))).toMatchObject({
			textQuery: 'Konoba Test, Split, Croatia',
			pageSize: 1,
			locationBias: { circle: { center: { latitude: 43.2, longitude: 16.2 }, radius: 500 } }
		});
	});

	test('refreshes only the place ID', async (): Promise<void> => {
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ id: 'ChIJ1234567890_new' }));
		const adapter = createGooglePlacesAdapter('server-key', fetchImplementation);

		expect(await adapter.refreshId('ChIJ1234567890_old')).toBe('ChIJ1234567890_new');
		expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain('?fields=id');
	});

	test('removes destination numbering from the text query', async (): Promise<void> => {
		const numberedFeature = structuredClone(feature);
		numberedFeature.properties.title = '4 Blue lagoon anchorage';
		numberedFeature.properties.layerPath = ['Dag 1 - Lørdag'];
		numberedFeature.properties.style.iconCode = '1623';
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ places: [{ id: 'ChIJ1234567890_test' }] }));
		const adapter = createGooglePlacesAdapter('server-key', fetchImplementation);

		await adapter.searchId(numberedFeature);
		const options = fetchImplementation.mock.calls[0]?.[1];
		expect(JSON.parse(String(options?.body)).textQuery).toBe(
			'Blue lagoon anchorage, Split, Croatia'
		);
	});
});
