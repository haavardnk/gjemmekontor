import { describe, expect, test } from 'vitest';

import { openFreeMapRestaurant } from './openfreemap-poi';

describe('OpenFreeMap restaurant selection', (): void => {
	test('normalizes a named restaurant from the rendered POI layer', (): void => {
		expect(
			openFreeMapRestaurant({
				geometry: { type: 'Point', coordinates: [16.4402, 43.5081] },
				properties: { name: 'Konoba Test', class: 'restaurant', rank: 3 }
			})
		).toEqual({
			source: 'openfreemap',
			title: 'Konoba Test',
			longitude: 16.4402,
			latitude: 43.5081,
			category: 'restaurant'
		});
	});

	test('accepts the restaurant subclass and falls back to a translated name', (): void => {
		expect(
			openFreeMapRestaurant({
				geometry: { type: 'Point', coordinates: [16.44, 43.5] },
				properties: { name_en: 'Harbour Restaurant', class: 'food', subclass: 'restaurant' }
			})?.title
		).toBe('Harbour Restaurant');
	});

	test.each([
		[{ name: 'Cafe Test', class: 'cafe' }, [16.44, 43.5]],
		[{ class: 'restaurant' }, [16.44, 43.5]],
		[{ name: 'Konoba Test', class: 'restaurant' }, [181, 43.5]]
	])(
		'rejects non-restaurants, unnamed POIs, and invalid coordinates',
		(properties, coordinates) => {
			expect(
				openFreeMapRestaurant({ geometry: { type: 'Point', coordinates }, properties })
			).toBeUndefined();
		}
	);
});
