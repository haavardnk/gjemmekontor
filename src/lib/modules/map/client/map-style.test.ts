import { describe, expect, test, vi } from 'vitest';

import { mapStyle, satelliteStyle } from './map-style';

describe('map style selection', (): void => {
	const protocol = { add: vi.fn() };

	test('uses OpenFreeMap for normal and nautical online maps', async (): Promise<void> => {
		await expect(mapStyle('normal', undefined, protocol)).resolves.toContain('openfreemap');
		await expect(mapStyle('nautical', undefined, protocol)).resolves.toContain('openfreemap');
	});

	test('builds the satellite imagery and label layers', async (): Promise<void> => {
		const style = satelliteStyle();
		expect(style.layers.map((layer) => layer.id)).toEqual(['satellite', 'satellite-labels']);
		expect(style.sources.satellite).toMatchObject({ type: 'raster', maxzoom: 18 });
		await expect(mapStyle('satellite', undefined, protocol)).resolves.toEqual(style);
	});
});
