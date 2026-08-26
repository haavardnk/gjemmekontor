import { z } from 'zod';

import type { MapFeature, MapSourceStyleLegend } from './types';

export const openFreeMapRestaurantSchema = z
	.object({
		source: z.literal('openfreemap'),
		title: z.string().trim().min(1).max(200),
		longitude: z.number().finite().min(-180).max(180),
		latitude: z.number().finite().min(-90).max(90),
		category: z.literal('restaurant')
	})
	.strict();

export type OpenFreeMapRestaurant = z.infer<typeof openFreeMapRestaurantSchema>;

export const openFreeMapRestaurantSourceStyle: MapSourceStyleLegend = {
	key: 'source-style-openfreemap-restaurant',
	color: '#9a5b3f',
	iconHref: '',
	iconCode: '1577',
	symbol: 'restaurant',
	label: 'Restauranter',
	count: 1
};

export function openFreeMapRestaurantFeature(
	restaurant: OpenFreeMapRestaurant,
	id: string
): MapFeature {
	return {
		type: 'Feature',
		id,
		geometry: {
			type: 'Point',
			coordinates: [restaurant.longitude, restaurant.latitude]
		},
		properties: {
			title: restaurant.title,
			description: '',
			snippet: '',
			address: '',
			layerId: 'openfreemap',
			layerName: 'OpenFreeMap',
			layerPath: ['OpenFreeMap'],
			extendedData: {},
			style: { iconCode: openFreeMapRestaurantSourceStyle.iconCode },
			sourceStyleKey: openFreeMapRestaurantSourceStyle.key
		}
	};
}
