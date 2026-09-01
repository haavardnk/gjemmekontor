import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';

import { openFreeMapRestaurant } from '$lib/modules/map/client/openfreemap-poi';
import type { OpenFreeMapRestaurant } from '$lib/modules/map/domain/openfreemap';

import type { Position } from '../domain/types';
import { isGeoJsonSource } from './map-sources';

export function registerMapInteractions(
	map: MapLibreMap,
	callbacks: {
		onSelectFeature: (id: string) => void;
		onSelectAis: (mmsi: number) => void;
		onSelectRestaurant: (restaurant: OpenFreeMapRestaurant) => void;
		onUserPan: () => void;
		onRotate: () => void;
	}
): void {
	const selectPoint = (event: { features?: MapGeoJSONFeature[] }): void => {
		const id = event.features?.[0]?.properties.featureId;
		if (typeof id === 'string') callbacks.onSelectFeature(id);
	};
	map.on('click', 'points', selectPoint);
	map.on('click', 'point-hit-targets', selectPoint);

	const selectAisVessel = (event: { features?: MapGeoJSONFeature[] }): void => {
		const mmsi = event.features?.[0]?.properties.mmsi;
		if (typeof mmsi === 'number') callbacks.onSelectAis(mmsi);
	};
	map.on('click', 'ais-vessels', selectAisVessel);
	map.on('click', 'ais-hit-targets', selectAisVessel);

	map.on('click', 'clusters', (event): void => {
		const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
		const clusterId = feature?.properties.cluster_id;
		const source = map.getSource('points');
		if (
			!isGeoJsonSource(source) ||
			typeof clusterId !== 'number' ||
			feature?.geometry.type !== 'Point'
		) {
			return;
		}
		const center: Position = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
		void source.getClusterExpansionZoom(clusterId).then((zoom) => map.easeTo({ center, zoom }));
	});

	map.on('click', (event): void => {
		const applicationLayers = [
			'points',
			'point-hit-targets',
			'clusters',
			'ais-vessels',
			'ais-hit-targets'
		].filter((id) => map.getLayer(id) !== undefined);
		if (
			applicationLayers.length > 0 &&
			map.queryRenderedFeatures(event.point, { layers: applicationLayers }).length > 0
		) {
			return;
		}
		const poiLayers = map
			.getStyle()
			.layers.filter((layer) => {
				if (layer.type !== 'symbol' && layer.type !== 'circle') return false;
				return (
					('source-layer' in layer && layer['source-layer'] === 'poi') ||
					/^poi_r\d+$/.test(layer.id)
				);
			})
			.map((layer) => layer.id);
		if (poiLayers.length === 0) return;
		const hitBox: [[number, number], [number, number]] = [
			[event.point.x - 10, event.point.y - 10],
			[event.point.x + 10, event.point.y + 10]
		];
		for (const feature of map.queryRenderedFeatures(hitBox, { layers: poiLayers })) {
			const restaurant = openFreeMapRestaurant(feature);
			if (restaurant) {
				callbacks.onSelectRestaurant(restaurant);
				return;
			}
		}
	});

	map.on('dragstart', callbacks.onUserPan);
	map.on('rotate', callbacks.onRotate);
}
