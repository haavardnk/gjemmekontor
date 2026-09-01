import { gpx } from '@tmcw/togeojson';
import type { Feature, GeoJsonProperties, LineString, MultiLineString, Position } from 'geojson';

import { type GpxDocument, gpxMaximumPoints, type GpxPoint, type NormalizedGpx } from './gpx-types';

function coordinateTimes(properties: GeoJsonProperties): unknown {
	if (!properties || typeof properties !== 'object') return undefined;
	const coordinateProperties = properties.coordinateProperties;
	return coordinateProperties && typeof coordinateProperties === 'object'
		? (coordinateProperties as Record<string, unknown>).times
		: undefined;
}

function validPosition(position: Position): position is [number, number] {
	return (
		position.length >= 2 &&
		typeof position[0] === 'number' &&
		typeof position[1] === 'number' &&
		Number.isFinite(position[0]) &&
		Number.isFinite(position[1]) &&
		position[0] >= -180 &&
		position[0] <= 180 &&
		position[1] >= -90 &&
		position[1] <= 90
	);
}

function normalizeSegment(coordinates: Position[], times: unknown): { points: GpxPoint[] } {
	if (!Array.isArray(times) || coordinates.length !== times.length) {
		throw new Error('GPX_TIMESTAMPS_REQUIRED');
	}
	const points = coordinates.map((position, index): GpxPoint => {
		const time = times[index];
		if (!validPosition(position) || typeof time !== 'string') {
			throw new Error('GPX_POINT_INVALID');
		}
		const timeMs = Date.parse(time);
		if (!Number.isFinite(timeMs)) throw new Error('GPX_TIMESTAMP_INVALID');
		return { position: [position[0], position[1]], time, timeMs };
	});
	for (let index = 1; index < points.length; index += 1) {
		if ((points[index]?.timeMs ?? 0) <= (points[index - 1]?.timeMs ?? 0)) {
			throw new Error('GPX_TIMESTAMPS_NOT_MONOTONIC');
		}
	}
	return { points };
}

function normalizeFeature(
	feature: Feature<LineString | MultiLineString>
): NormalizedGpx['segments'] {
	const times = coordinateTimes(feature.properties);
	if (feature.geometry.type === 'LineString') {
		return [normalizeSegment(feature.geometry.coordinates, times)];
	}
	if (!Array.isArray(times) || times.length !== feature.geometry.coordinates.length) {
		throw new Error('GPX_TIMESTAMPS_REQUIRED');
	}
	return feature.geometry.coordinates.map((coordinates, index) =>
		normalizeSegment(coordinates, times[index])
	);
}

export function normalizeGpxDocument(document: GpxDocument): NormalizedGpx {
	if (document.doctype || document.documentElement?.localName !== 'gpx') {
		throw new Error('GPX_DOCUMENT_INVALID');
	}
	const features = gpx(document).features.filter(
		(feature): feature is Feature<LineString | MultiLineString> =>
			(feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') &&
			feature.properties?._gpxType === 'trk'
	);
	if (!features.length) throw new Error('GPX_TRACK_REQUIRED');
	const segments = features
		.flatMap(normalizeFeature)
		.filter((segment) => segment.points.length > 0);
	if (segments.reduce((total, segment) => total + segment.points.length, 0) > gpxMaximumPoints) {
		throw new Error('GPX_TOO_MANY_POINTS');
	}
	for (let index = 1; index < segments.length; index += 1) {
		const previous = segments[index - 1]?.points.at(-1);
		const current = segments[index]?.points[0];
		if (previous && current && current.timeMs <= previous.timeMs) {
			throw new Error('GPX_TIMESTAMPS_NOT_MONOTONIC');
		}
	}
	const name = features
		.map((feature) => feature.properties?.name)
		.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
	return { name: name?.trim() ?? 'GPX-etappe', segments };
}
