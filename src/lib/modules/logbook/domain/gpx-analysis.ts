import {
	type GpxExtraction,
	gpxExtractionVersion,
	type GpxPoint,
	type GpxRecordingGap,
	type GpxStationaryBlock,
	type NormalizedGpx
} from './gpx-types';

const earthRadiusMeters = 6_371_008.8;
const metersPerNauticalMile = 1_852;
const stationaryRadiusMeters = 25;
const stationaryMinimumSeconds = 180;
const stationaryMaximumKnots = 0.3;
const recordingGapSeconds = 300;
const simplificationMeters = 5;

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

export function analyzeGpx(normalized: NormalizedGpx): GpxExtraction {
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
