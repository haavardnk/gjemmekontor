import type { Map as MapLibreMap } from 'maplibre-gl';

import type { ActualRouteFeature } from '$lib/modules/logbook/public';
import { pinImage } from '$lib/modules/map/client/marker-images';
import type { AisVesselFeature } from '$lib/modules/map/domain/ais';
import type { OfflineMapRecord } from '$lib/modules/map/public';

import type { MapFeature, MapMode, MapSnapshot } from '../domain/types';

export interface MapMarkerImages {
	position?: ImageData;
	positionFlipped?: ImageData;
	ais?: ImageData;
	aisFlipped?: ImageData;
}

interface AddApplicationLayersOptions {
	map: MapLibreMap;
	snapshot: MapSnapshot;
	mode: MapMode;
	offlineMap?: OfflineMapRecord;
	depthContoursEnabled: boolean;
	pointFeatures: GeoJSON.FeatureCollection<GeoJSON.Geometry, MapFeature['properties']>;
	lineFeatures: GeoJSON.FeatureCollection<GeoJSON.Geometry, MapFeature['properties']>;
	actualRoutes: ActualRouteFeature[];
	aisFeatures: GeoJSON.FeatureCollection<
		GeoJSON.Point,
		AisVesselFeature['properties'] & { selected: boolean }
	>;
	markerImages: MapMarkerImages;
}

export function ensureMapMarkerImages(map: MapLibreMap, snapshot: MapSnapshot): void {
	if (!map.hasImage('source-style-default')) {
		map.addImage('source-style-default', pinImage('#5f6b6d', 'poi', false), { pixelRatio: 2 });
		map.addImage('source-style-default-selected', pinImage('#5f6b6d', 'poi', true), {
			pixelRatio: 2
		});
	}
	for (const sourceStyle of snapshot.sourceStyles) {
		if (map.hasImage(sourceStyle.key)) continue;
		map.addImage(sourceStyle.key, pinImage(sourceStyle.color, sourceStyle.symbol, false), {
			pixelRatio: 2
		});
		map.addImage(
			`${sourceStyle.key}-selected`,
			pinImage(sourceStyle.color, sourceStyle.symbol, true),
			{ pixelRatio: 2 }
		);
	}
}

export function addApplicationLayers({
	map,
	snapshot,
	mode,
	offlineMap,
	depthContoursEnabled,
	pointFeatures,
	lineFeatures,
	actualRoutes,
	aisFeatures,
	markerImages
}: AddApplicationLayersOptions): void {
	ensureMapMarkerImages(map, snapshot);
	if (markerImages.position && !map.hasImage('position-duck')) {
		map.addImage('position-duck', markerImages.position, { pixelRatio: 2 });
	}
	if (markerImages.positionFlipped && !map.hasImage('position-duck-flipped')) {
		map.addImage('position-duck-flipped', markerImages.positionFlipped, { pixelRatio: 2 });
	}
	if (markerImages.ais && !map.hasImage('ais-flamingo')) {
		map.addImage('ais-flamingo', markerImages.ais, { pixelRatio: 4 });
	}
	if (markerImages.aisFlipped && !map.hasImage('ais-flamingo-flipped')) {
		map.addImage('ais-flamingo-flipped', markerImages.aisFlipped, { pixelRatio: 4 });
	}
	if (mode === 'nautical' && !offlineMap) {
		map.addSource('marine-profile', {
			type: 'raster',
			tiles: ['/api/map/marine-profile/{z}/{x}/{y}'],
			tileSize: 256,
			maxzoom: 18,
			attribution:
				'<a href="https://www.openseamap.org/">OpenSeaMap</a> / <a href="https://www.gebco.net/">GEBCO</a>, ODbL'
		});
		map.addSource('seamarks', {
			type: 'raster',
			tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
			tileSize: 256,
			attribution:
				'<a href="https://www.openseamap.org/">OpenSeaMap</a> contributors, ODbL / CC BY-SA 2.0'
		});
		if (depthContoursEnabled) {
			map.addSource('depth-contours', {
				type: 'raster',
				tiles: ['/api/map/depth-contours/{z}/{x}/{y}'],
				tileSize: 256,
				maxzoom: 18,
				attribution:
					'<a href="https://depth.openseamap.org/">OpenSeaMap water depths</a> contributors'
			});
		}
		map.addLayer({
			id: 'marine-profile',
			type: 'raster',
			source: 'marine-profile',
			paint: { 'raster-opacity': 0.7 }
		});
		if (depthContoursEnabled) {
			map.addLayer({
				id: 'depth-contours',
				type: 'raster',
				source: 'depth-contours',
				minzoom: 7,
				paint: { 'raster-opacity': 0.9 }
			});
		}
		map.addLayer({
			id: 'seamarks',
			type: 'raster',
			source: 'seamarks',
			minzoom: 8,
			paint: { 'raster-opacity': 0.9 }
		});
	}
	map.addSource('points', {
		type: 'geojson',
		data: pointFeatures,
		cluster: true,
		clusterMaxZoom: 10,
		clusterRadius: 28
	});
	map.addSource('lines', { type: 'geojson', data: lineFeatures });
	map.addSource('actual-routes', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: actualRoutes }
	});
	map.addSource('location', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});
	map.addSource('ais-vessels', {
		type: 'geojson',
		data: aisFeatures
	});
	map.addLayer({
		id: 'routes',
		type: 'line',
		source: 'lines',
		paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 }
	});
	map.addLayer({
		id: 'actual-route-casing',
		type: 'line',
		source: 'actual-routes',
		paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.38 }
	});
	map.addLayer({
		id: 'actual-routes',
		type: 'line',
		source: 'actual-routes',
		paint: {
			'line-color': '#3f7278',
			'line-width': 2,
			'line-opacity': 0.72,
			'line-dasharray': [1.5, 2.5]
		}
	});
	map.addLayer({
		id: 'clusters',
		type: 'circle',
		source: 'points',
		filter: ['has', 'point_count'],
		paint: {
			'circle-color': '#153e4b',
			'circle-radius': ['step', ['get', 'point_count'], 18, 20, 23, 50, 28],
			'circle-stroke-color': '#ffffff',
			'circle-stroke-width': 2
		}
	});
	if (!offlineMap) {
		map.addLayer({
			id: 'cluster-count',
			type: 'symbol',
			source: 'points',
			filter: ['has', 'point_count'],
			layout: {
				'text-field': ['get', 'point_count_abbreviated'],
				'text-font': ['Noto Sans Regular'],
				'text-size': 12
			},
			paint: { 'text-color': '#ffffff' }
		});
	}
	map.addLayer({
		id: 'point-hit-targets',
		type: 'circle',
		source: 'points',
		filter: ['!', ['has', 'point_count']],
		paint: {
			'circle-color': '#000000',
			'circle-opacity': 0.01,
			'circle-radius': 22,
			'circle-translate': [0, -18]
		}
	});
	map.addLayer({
		id: 'points',
		type: 'symbol',
		source: 'points',
		filter: ['!', ['has', 'point_count']],
		layout: {
			'icon-image': [
				'case',
				['get', 'selected'],
				['concat', ['get', 'sourceStyleKey'], '-selected'],
				['get', 'sourceStyleKey']
			],
			'icon-anchor': 'bottom',
			'icon-allow-overlap': true
		}
	});
	map.addLayer({
		id: 'accuracy',
		type: 'fill',
		source: 'location',
		filter: ['==', ['get', 'kind'], 'accuracy'],
		paint: { 'fill-color': '#2563a8', 'fill-opacity': 0.14 }
	});
	map.addLayer({
		id: 'position',
		type: 'symbol',
		source: 'location',
		metadata: { marker: 'monsieur-bintang' },
		filter: ['==', ['get', 'kind'], 'position'],
		layout: {
			'icon-image': [
				'case',
				[
					'all',
					['==', ['get', 'moving'], true],
					['>=', ['coalesce', ['get', 'heading'], 0], 180],
					['<', ['coalesce', ['get', 'heading'], 0], 360]
				],
				'position-duck-flipped',
				'position-duck'
			],
			'icon-rotate': [
				'case',
				['!=', ['get', 'moving'], true],
				0,
				['<', ['coalesce', ['get', 'heading'], 0], 180],
				['-', ['coalesce', ['get', 'heading'], 0], 90],
				['-', ['coalesce', ['get', 'heading'], 0], 270]
			],
			'icon-rotation-alignment': 'map',
			'icon-allow-overlap': true
		}
	});
	map.addLayer({
		id: 'ais-selected',
		type: 'circle',
		source: 'ais-vessels',
		filter: ['==', ['get', 'selected'], true],
		paint: {
			'circle-color': '#ffffff',
			'circle-opacity': 0.92,
			'circle-radius': 17,
			'circle-stroke-color': '#17343c',
			'circle-stroke-width': 2
		}
	});
	map.addLayer({
		id: 'ais-hit-targets',
		type: 'circle',
		source: 'ais-vessels',
		paint: {
			'circle-color': '#000000',
			'circle-opacity': 0.01,
			'circle-radius': 18
		}
	});
	map.addLayer({
		id: 'ais-vessels',
		type: 'symbol',
		source: 'ais-vessels',
		layout: {
			'icon-image': [
				'case',
				[
					'all',
					['>=', ['coalesce', ['get', 'direction'], 0], 180],
					['<', ['coalesce', ['get', 'direction'], 0], 360]
				],
				'ais-flamingo-flipped',
				'ais-flamingo'
			],
			'icon-size': [
				'interpolate',
				['linear'],
				['coalesce', ['get', 'lengthMeters'], 20],
				0,
				0.32,
				20,
				0.36,
				100,
				0.48,
				300,
				0.62
			],
			'icon-allow-overlap': true,
			'icon-ignore-placement': false
		},
		paint: { 'icon-opacity': 1 }
	});
}
