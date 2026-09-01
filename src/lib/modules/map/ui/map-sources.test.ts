import { describe, expect, test } from 'vitest';

import type { AisVesselFeature } from '$lib/modules/map/domain/ais';

import type { MapFeature, MapSnapshot } from '../domain/types';
import { aisFeatureCollection, mapFeatureCollection } from './map-sources';

function feature(id: string, layerId: string, geometry: MapFeature['geometry']): MapFeature {
	return {
		type: 'Feature',
		id,
		geometry,
		properties: {
			title: id,
			description: '',
			snippet: '',
			address: '',
			layerId,
			layerName: layerId,
			layerPath: [],
			extendedData: {},
			style: {}
		}
	};
}

const snapshot: MapSnapshot = {
	version: 1,
	type: 'FeatureCollection',
	title: 'Map',
	description: '',
	fetchedAt: '2027-01-01T00:00:00.000Z',
	sourceHash: 'hash',
	bounds: [10, 59, 11, 60],
	layers: [
		{
			id: 'places',
			name: 'Places',
			path: [],
			color: '#123456',
			featureCount: 1,
			pointCount: 1,
			lineCount: 0
		},
		{
			id: 'routes',
			name: 'Routes',
			path: [],
			color: '#654321',
			featureCount: 1,
			pointCount: 0,
			lineCount: 1
		}
	],
	sourceStyles: [],
	features: [
		feature('place', 'places', { type: 'Point', coordinates: [10.5, 59.5] }),
		feature('route', 'routes', {
			type: 'LineString',
			coordinates: [
				[10.5, 59.5],
				[10.6, 59.6]
			]
		})
	]
};

describe('map source projections', (): void => {
	test('filters layers while retaining the selected feature', (): void => {
		const points = mapFeatureCollection(snapshot, 'points', {
			selectedId: 'place',
			visibleLayerIds: new Set(['routes']),
			visibleSourceStyleKeys: new Set(),
			hiddenRouteIds: new Set()
		});
		expect(points.features).toHaveLength(1);
		expect(points.features[0]?.properties).toMatchObject({
			featureId: 'place',
			color: '#123456',
			selected: true
		});

		const lines = mapFeatureCollection(snapshot, 'lines', {
			selectedId: undefined,
			visibleLayerIds: new Set(),
			visibleSourceStyleKeys: new Set(),
			hiddenRouteIds: new Set(['route'])
		});
		expect(lines.features).toEqual([]);
	});

	test('marks the selected AIS vessel without mutating input', (): void => {
		const vessel = {
			type: 'Feature',
			id: 'ais-123',
			geometry: { type: 'Point', coordinates: [10.5, 59.5] },
			properties: {
				mmsi: 123,
				name: 'Test',
				direction: 0,
				lastSeenAt: '2027-01-01T00:00:00.000Z'
			}
		} satisfies AisVesselFeature;
		const projected = aisFeatureCollection([vessel], 123);
		expect(projected.features[0]?.properties.selected).toBe(true);
		expect(vessel.properties).not.toHaveProperty('selected');
	});
});
