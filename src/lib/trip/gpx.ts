import { gpx } from '@tmcw/togeojson';
import type { Feature, GeoJsonProperties, LineString, MultiLineString, Position } from 'geojson';

export const gpxExtractionVersion = 1;
export const gpxMaximumBytes = 5_000_000;
export const gpxMaximumPoints = 50_000;

const earthRadiusMeters = 6_371_008.8;
const metersPerNauticalMile = 1_852;
const stationaryRadiusMeters = 25;
const stationaryMinimumSeconds = 180;
const stationaryMaximumKnots = 0.3;
const recordingGapSeconds = 300;
const simplificationMeters = 5;

type GpxDocument = Parameters<typeof gpx>[0];

type GpxPoint = {
	position: [longitude: number, latitude: number];
	time: string;
	timeMs: number;
};

type GpxSegment = {
	points: GpxPoint[];
};

export type GpxStationaryBlock = {
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
};

export type GpxRecordingGap = {
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
};

export type GpxExtraction = {
	version: 1;
	name: string;
	departureAt: string;
	arrivalAt: string;
	nauticalMiles: number;
	activeSeconds: number;
	elapsedSeconds: number;
	stationarySeconds: number;
	originalPointCount: number;
	routePointCount: number;
	segments: [number, number][][];
	stationaryBlocks: GpxStationaryBlock[];
	recordingGaps: GpxRecordingGap[];
};

function radians(value: number): number {
	return (value * Math.PI) / 180;
}

export function distanceMeters(left: [number, number], right: [number, number]): number {
	const latitudeDelta = radians(right[1] - left[1]);
	const longitudeDelta = radians(right[0] - left[0]);
	const leftLatitude = radians(left[1]);
	const rightLatitude = radians(right[1]);
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
	return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
		: (sorted[middle] ?? 0);
}

function edgeKnots(left: GpxPoint, right: GpxPoint): number {
	const seconds = (right.timeMs - left.timeMs) / 1_000;
	return seconds > 0 ? (distanceMeters(left.position, right.position) / seconds) * 1.943_844 : 0;
}

function coordinateTimes(properties: GeoJsonProperties): unknown {
	if (!properties || typeof properties !== 'object') {
		return undefined;
	}
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

function normalizeSegment(coordinates: Position[], times: unknown): GpxSegment {
	if (!Array.isArray(times) || coordinates.length !== times.length) {
		throw new Error('GPX_TIMESTAMPS_REQUIRED');
	}
	const points = coordinates.map((position, index): GpxPoint => {
		const time = times[index];
		if (!validPosition(position) || typeof time !== 'string') {
			throw new Error('GPX_POINT_INVALID');
		}
		const timeMs = Date.parse(time);
		if (!Number.isFinite(timeMs)) {
			throw new Error('GPX_TIMESTAMP_INVALID');
		}
		return { position: [position[0], position[1]], time, timeMs };
	});
	for (let index = 1; index < points.length; index += 1) {
		if ((points[index]?.timeMs ?? 0) <= (points[index - 1]?.timeMs ?? 0)) {
			throw new Error('GPX_TIMESTAMPS_NOT_MONOTONIC');
		}
	}
	return { points };
}

function normalizeFeature(feature: Feature<LineString | MultiLineString>): GpxSegment[] {
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

function normalizeDocument(document: GpxDocument): { name: string; segments: GpxSegment[] } {
	if (document.doctype || document.documentElement?.localName !== 'gpx') {
		throw new Error('GPX_DOCUMENT_INVALID');
	}
	const collection = gpx(document);
	const features = collection.features.filter(
		(feature): feature is Feature<LineString | MultiLineString> =>
			(feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') &&
			feature.properties?._gpxType === 'trk'
	);
	if (features.length === 0) {
		throw new Error('GPX_TRACK_REQUIRED');
	}
	const segments = features
		.flatMap(normalizeFeature)
		.filter((segment) => segment.points.length > 0);
	const pointCount = segments.reduce((total, segment) => total + segment.points.length, 0);
	if (pointCount > gpxMaximumPoints) {
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

function markStationary(points: GpxPoint[]): boolean[] {
	const stationary = Array.from({ length: points.length }, () => false);
	const speeds = points.slice(1).map((point, index) => edgeKnots(points[index] ?? point, point));
	const smoothedSpeeds = speeds.map((_speed, index) =>
		median(speeds.slice(Math.max(0, index - 1), index + 2))
	);
	let runStart: number | undefined;
	const finishRun = (end: number): void => {
		if (runStart === undefined || end <= runStart) {
			runStart = undefined;
			return;
		}
		const first = points[runStart];
		const last = points[end];
		if (first && last && (last.timeMs - first.timeMs) / 1_000 >= stationaryMinimumSeconds) {
			for (let pointIndex = runStart; pointIndex <= end; pointIndex += 1) {
				stationary[pointIndex] = true;
			}
		}
		runStart = undefined;
	};
	for (let edgeIndex = 0; edgeIndex < smoothedSpeeds.length; edgeIndex += 1) {
		if ((smoothedSpeeds[edgeIndex] ?? Number.POSITIVE_INFINITY) > stationaryMaximumKnots) {
			finishRun(edgeIndex);
			continue;
		}
		runStart ??= edgeIndex;
		const origin = points[runStart];
		const next = points[edgeIndex + 1];
		if (origin && next && distanceMeters(origin.position, next.position) > stationaryRadiusMeters) {
			finishRun(edgeIndex);
			runStart = edgeIndex;
		}
	}
	finishRun(points.length - 1);
	return stationary;
}

function stationaryBlocks(points: GpxPoint[], stationary: boolean[]): GpxStationaryBlock[] {
	const blocks: GpxStationaryBlock[] = [];
	let start: number | undefined;
	for (let index = 0; index <= stationary.length; index += 1) {
		if (stationary[index] && start === undefined) {
			start = index;
		}
		if ((!stationary[index] || index === stationary.length) && start !== undefined) {
			const end = index - 1;
			const first = points[start];
			const last = points[end];
			if (first && last) {
				blocks.push({
					startedAt: first.time,
					endedAt: last.time,
					durationSeconds: Math.round((last.timeMs - first.timeMs) / 1_000)
				});
			}
			start = undefined;
		}
	}
	return blocks;
}

function perpendicularMeters(
	point: [number, number],
	start: [number, number],
	end: [number, number]
): number {
	if (start[0] === end[0] && start[1] === end[1]) {
		return distanceMeters(point, start);
	}
	const latitude = radians((start[1] + end[1] + point[1]) / 3);
	const xScale = Math.cos(latitude);
	const startX = start[0] * xScale;
	const endX = end[0] * xScale;
	const pointX = point[0] * xScale;
	const deltaX = endX - startX;
	const deltaY = end[1] - start[1];
	const projection = Math.max(
		0,
		Math.min(
			1,
			((pointX - startX) * deltaX + (point[1] - start[1]) * deltaY) / (deltaX ** 2 + deltaY ** 2)
		)
	);
	return distanceMeters(point, [
		(startX + projection * deltaX) / xScale,
		start[1] + projection * deltaY
	]);
}

function simplify(points: [number, number][]): [number, number][] {
	if (points.length <= 2) {
		return points;
	}
	const kept = Array.from({ length: points.length }, () => false);
	kept[0] = true;
	kept[points.length - 1] = true;
	const work: [start: number, end: number][] = [[0, points.length - 1]];
	while (work.length > 0) {
		const range = work.pop();
		if (!range) {
			continue;
		}
		const [startIndex, endIndex] = range;
		const start = points[startIndex];
		const end = points[endIndex];
		if (!start || !end) {
			continue;
		}
		let maximumDistance = 0;
		let splitIndex = 0;
		for (let index = startIndex + 1; index < endIndex; index += 1) {
			const point = points[index];
			if (!point) {
				continue;
			}
			const distance = perpendicularMeters(point, start, end);
			if (distance > maximumDistance) {
				maximumDistance = distance;
				splitIndex = index;
			}
		}
		if (maximumDistance > simplificationMeters) {
			kept[splitIndex] = true;
			work.push([startIndex, splitIndex], [splitIndex, endIndex]);
		}
	}
	return points.filter((_point, index) => kept[index]);
}

export function extractGpxDocument(document: GpxDocument): GpxExtraction {
	const normalized = normalizeDocument(document);
	let nauticalMeters = 0;
	let activeSeconds = 0;
	let stationarySeconds = 0;
	let departure: GpxPoint | undefined;
	let arrival: GpxPoint | undefined;
	let originalPointCount = 0;
	const routeSegments: [number, number][][] = [];
	const blocks: GpxStationaryBlock[] = [];
	const gaps: GpxRecordingGap[] = [];

	for (const segment of normalized.segments) {
		originalPointCount += segment.points.length;
		const stationary = markStationary(segment.points);
		blocks.push(...stationaryBlocks(segment.points, stationary));
		let route: [number, number][] = [];
		for (let index = 1; index < segment.points.length; index += 1) {
			const left = segment.points[index - 1];
			const right = segment.points[index];
			if (!left || !right) {
				continue;
			}
			const seconds = (right.timeMs - left.timeMs) / 1_000;
			const meters = distanceMeters(left.position, right.position);
			if (seconds > recordingGapSeconds && meters > stationaryRadiusMeters) {
				if (route.length >= 2) {
					routeSegments.push(simplify(route));
				}
				route = [];
				gaps.push({
					startedAt: left.time,
					endedAt: right.time,
					durationSeconds: Math.round(seconds)
				});
				continue;
			}
			if (stationary[index - 1] && stationary[index]) {
				stationarySeconds += seconds;
				continue;
			}
			if (route.length === 0) {
				route.push(left.position);
			} else if (
				distanceMeters(route.at(-1) ?? left.position, left.position) > stationaryRadiusMeters
			) {
				if (route.length >= 2) {
					routeSegments.push(simplify(route));
				}
				route = [left.position];
			}
			route.push(right.position);
			nauticalMeters += meters;
			activeSeconds += seconds;
			departure ??= left;
			arrival = right;
		}
		if (route.length >= 2) {
			routeSegments.push(simplify(route));
		}
	}

	if (
		!departure ||
		!arrival ||
		routeSegments.length === 0 ||
		nauticalMeters < stationaryRadiusMeters
	) {
		throw new Error('GPX_MOVEMENT_REQUIRED');
	}
	const routePointCount = routeSegments.reduce((total, segment) => total + segment.length, 0);
	return {
		version: gpxExtractionVersion,
		name: normalized.name,
		departureAt: departure.time,
		arrivalAt: arrival.time,
		nauticalMiles: nauticalMeters / metersPerNauticalMile,
		activeSeconds: Math.round(activeSeconds),
		elapsedSeconds: Math.round((arrival.timeMs - departure.timeMs) / 1_000),
		stationarySeconds: Math.round(stationarySeconds),
		originalPointCount,
		routePointCount,
		segments: routeSegments,
		stationaryBlocks: blocks,
		recordingGaps: gaps
	};
}

export function extractGpxXml(xml: string, parse: (value: string) => GpxDocument): GpxExtraction {
	if (new TextEncoder().encode(xml).byteLength > gpxMaximumBytes) {
		throw new Error('GPX_TOO_LARGE');
	}
	return extractGpxDocument(parse(xml));
}
