import type { GeoJSONSource, Source } from 'maplibre-gl';

import type { AisVesselFeature } from '$lib/modules/map/domain/ais';

import type { MapFeature, MapSnapshot } from '../domain/types';

export function isGeoJsonSource(source: Source | undefined): source is GeoJSONSource {
	return source !== undefined && 'setData' in source;
}

export function mapFeatureCollection(
	snapshot: MapSnapshot,
	kind: 'points' | 'lines',
	options: {
		selectedId: string | undefined;
		visibleLayerIds: Set<string>;
		visibleSourceStyleKeys: Set<string>;
		hiddenRouteIds: Set<string>;
	}
): { type: 'FeatureCollection'; features: MapFeature[] } {
	return {
		type: 'FeatureCollection',
		features: snapshot.features
			.filter((feature) => kind !== 'lines' || !options.hiddenRouteIds.has(feature.id))
			.filter(
				(feature) =>
					feature.id === options.selectedId ||
					options.visibleLayerIds.size === 0 ||
					options.visibleLayerIds.has(feature.properties.layerId)
			)
			.filter(
				(feature) =>
					feature.id === options.selectedId ||
					feature.geometry.type !== 'Point' ||
					feature.properties.sourceStyleKey === undefined ||
					options.visibleSourceStyleKeys.size === 0 ||
					options.visibleSourceStyleKeys.has(feature.properties.sourceStyleKey)
			)
			.filter((feature) =>
				kind === 'points' ? feature.geometry.type === 'Point' : feature.geometry.type !== 'Point'
			)
			.map((feature) => ({
				...feature,
				properties: {
					...feature.properties,
					featureId: feature.id,
					sourceStyleKey: feature.properties.sourceStyleKey ?? 'source-style-default',
					color:
						feature.properties.style.color ??
						snapshot.layers.find((layer) => layer.id === feature.properties.layerId)?.color ??
						'#0f766e',
					selected: feature.id === options.selectedId
				}
			}))
	};
}

export function aisFeatureCollection(
	vessels: AisVesselFeature[],
	selectedMmsi: number | undefined
): GeoJSON.FeatureCollection<
	GeoJSON.Point,
	AisVesselFeature['properties'] & { selected: boolean }
> {
	return {
		type: 'FeatureCollection',
		features: vessels.map((feature) => ({
			...feature,
			properties: {
				...feature.properties,
				selected: feature.properties.mmsi === selectedMmsi
			}
		}))
	};
}
