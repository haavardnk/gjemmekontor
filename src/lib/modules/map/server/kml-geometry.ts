import type {
	GeometryCollection,
	LineStringGeometry,
	MapGeometry,
	PointGeometry,
	PolygonGeometry,
	Position
} from '$lib/modules/map/domain/types';

import { node, text, values } from './kml-xml';

function parseCoordinates(value: unknown): Position[] {
	return text(value)
		.split(/\s+/)
		.filter(Boolean)
		.map((coordinate): Position | undefined => {
			const [rawLongitude, rawLatitude] = coordinate.split(',');
			const longitude = Number(rawLongitude);
			const latitude = Number(rawLatitude);
			return Number.isFinite(longitude) &&
				Number.isFinite(latitude) &&
				longitude >= -180 &&
				longitude <= 180 &&
				latitude >= -90 &&
				latitude <= 90
				? [longitude, latitude]
				: undefined;
		})
		.filter((coordinate): coordinate is Position => coordinate !== undefined);
}

function point(value: unknown): PointGeometry | undefined {
	const coordinates = parseCoordinates(node(value)?.coordinates);
	return coordinates.length === 1 ? { type: 'Point', coordinates: coordinates[0] } : undefined;
}

function lineString(value: unknown): LineStringGeometry | undefined {
	const coordinates = parseCoordinates(node(value)?.coordinates);
	return coordinates.length >= 2 ? { type: 'LineString', coordinates } : undefined;
}

function polygon(value: unknown): PolygonGeometry | undefined {
	const polygonNode = node(value);
	if (!polygonNode) return undefined;
	const boundaries = [
		...values(polygonNode.outerBoundaryIs),
		...values(polygonNode.innerBoundaryIs)
	];
	const coordinates = boundaries
		.map((boundary) => parseCoordinates(node(node(boundary)?.LinearRing)?.coordinates))
		.filter((ring) => ring.length >= 4);
	return coordinates.length ? { type: 'Polygon', coordinates } : undefined;
}

export function geometries(value: unknown): MapGeometry[] {
	const geometryNode = node(value);
	if (!geometryNode) return [];
	const result: MapGeometry[] = [];
	for (const candidate of values(geometryNode.Point)) {
		const geometry = point(candidate);
		if (geometry) result.push(geometry);
	}
	for (const candidate of values(geometryNode.LineString)) {
		const geometry = lineString(candidate);
		if (geometry) result.push(geometry);
	}
	for (const candidate of values(geometryNode.Polygon)) {
		const geometry = polygon(candidate);
		if (geometry) result.push(geometry);
	}
	for (const candidate of values(geometryNode.MultiGeometry)) {
		const nested = geometries(candidate);
		if (nested.length) {
			const collection: GeometryCollection = { type: 'GeometryCollection', geometries: nested };
			result.push(collection);
		}
	}
	return result;
}

export function geometryCounts(geometry: MapGeometry): { points: number; lines: number } {
	if (geometry.type === 'Point') return { points: 1, lines: 0 };
	if (geometry.type === 'LineString') return { points: 0, lines: 1 };
	if (geometry.type !== 'GeometryCollection') return { points: 0, lines: 0 };
	return geometry.geometries.reduce(
		(total, child) => {
			const counts = geometryCounts(child);
			return { points: total.points + counts.points, lines: total.lines + counts.lines };
		},
		{ points: 0, lines: 0 }
	);
}

export function positions(geometry: MapGeometry): Position[] {
	if (geometry.type === 'Point') return [geometry.coordinates];
	if (geometry.type === 'LineString') return geometry.coordinates;
	if (geometry.type === 'Polygon') return geometry.coordinates.flat();
	return geometry.geometries.flatMap(positions);
}
