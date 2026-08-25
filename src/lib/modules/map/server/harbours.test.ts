import { describe, expect, test, vi } from 'vitest';

import { handleHarbours, parseHarbours } from './harbours';

const bounds = { west: 15.7, south: 42.7, east: 17, north: 43.7 };

describe('OpenSeaMap harbours', (): void => {
	test('parses valid in-bounds harbour markers', (): void => {
		const collection = parseHarbours(
			"putHarbourMarker(359, 16.4383, 43.1683, 'Hvar-Hvar_Stadt', 'http://example.com', -1);\nputHarbourMarker(1, 18, 44, 'Outside', '', 2);",
			bounds
		);

		expect(collection.features).toEqual([
			{
				type: 'Feature',
				id: 'harbour-359',
				geometry: { type: 'Point', coordinates: [16.4383, 43.1683] },
				properties: { name: 'Hvar-Hvar Stadt', type: -1 }
			}
		]);
	});

	test('validates bounds and constrains the upstream request', async (): Promise<void> => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response("putHarbourMarker(359, 16.4383, 43.1683, 'Hvar', '', 5);"));
		const response = await handleHarbours(
			new URL('http://localhost/api/map/harbours?west=15.7&south=42.7&east=17&north=43.7&zoom=10'),
			fetcher
		);
		const upstream = new URL(String(fetcher.mock.calls[0]?.[0]));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, max-age=300');
		expect(upstream.hostname).toBe('harbour.openseamap.org');
		expect(upstream.searchParams.get('maxSize')).toBe('6');
		expect(await response.json()).toMatchObject({ features: [{ id: 'harbour-359' }] });
	});

	test('rejects invalid bounds and upstream failures', async (): Promise<void> => {
		const invalid = await handleHarbours(
			new URL('http://localhost/api/map/harbours?west=15&south=42&east=40&north=44&zoom=10')
		);
		const unavailable = await handleHarbours(
			new URL('http://localhost/api/map/harbours?west=15.7&south=42.7&east=17&north=43.7&zoom=10'),
			vi.fn<typeof fetch>().mockResolvedValue(new Response('error', { status: 500 }))
		);

		expect(invalid.status).toBe(400);
		expect(unavailable.status).toBe(502);
	});
});
