import { describe, expect, test, vi } from 'vitest';

import { handleDepthContourTile, handleMarineProfileTile, tileBounds } from './depth-contours';

describe('OpenSeaMap depth contour tiles', (): void => {
	test('converts web mercator tile coordinates to geographic bounds', (): void => {
		const bounds = tileBounds(9, 279, 187);

		expect(bounds.west).toBeCloseTo(16.171875);
		expect(bounds.south).toBeCloseTo(43.06889, 4);
		expect(bounds.east).toBeCloseTo(16.875);
		expect(bounds.north).toBeCloseTo(43.58039, 4);
	});

	test('proxies calculated contours without measured tracks', async (): Promise<void> => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), {
				headers: { 'content-type': 'image/png' }
			})
		);

		const response = await handleDepthContourTile('9', '279', '187', fetcher);
		const url = new URL(String(fetcher.mock.calls[0]?.[0]));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, max-age=86400');
		expect(url.hostname).toBe('depth.openseamap.org');
		expect(url.searchParams.get('LAYERS')).toBe('openseamap:contour2,openseamap:contour');
		expect(url.searchParams.get('BBOX')).toBe(
			'16.171875,43.06888777416962,16.875,43.58039085560785'
		);
	});

	test('proxies the GEBCO Marine Profile in web mercator', async (): Promise<void> => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), {
				headers: { 'content-type': 'image/png' }
			})
		);

		const response = await handleMarineProfileTile('8', '139', '93', fetcher);
		const url = new URL(String(fetcher.mock.calls[0]?.[0]));

		expect(response.status).toBe(200);
		expect(url.hostname).toBe('geoserver.openseamap.org');
		expect(url.searchParams.get('LAYERS')).toBe('gebco2021:gebco_2021');
		expect(url.searchParams.get('SRS')).toBe('EPSG:3857');
	});

	test('rejects invalid coordinates and non-PNG responses', async (): Promise<void> => {
		const invalid = await handleDepthContourTile('9', '512', '0');
		const unavailable = await handleDepthContourTile(
			'9',
			'279',
			'187',
			vi.fn<typeof fetch>().mockResolvedValue(new Response('error', { status: 500 }))
		);

		expect(invalid.status).toBe(400);
		expect(unavailable.status).toBe(502);
	});
});
