import { createHash } from 'node:crypto';

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';

import {
	type GeometryCollection,
	type LineStringGeometry,
	type MapBounds,
	type MapFeature,
	type MapFeatureStyle,
	type MapGeometry,
	type MapLayer,
	mapPointCategory,
	type MapSnapshot,
	type MapSourceStyleKey,
	type MapSourceStyleLegend,
	type PointGeometry,
	type PolygonGeometry,
	type Position
} from '$lib/map/types';

type XmlNode = Record<string, unknown>;

const fallbackColors = [
	'#0f766e',
	'#dc6b3f',
	'#c08a16',
	'#2563a8',
	'#9a497d',
	'#39724d',
	'#b54d4d',
	'#6656a3',
	'#56717d'
];

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	parseTagValue: false,
	trimValues: false
});

function node(value: unknown): XmlNode | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as XmlNode)
		: undefined;
}

function values(value: unknown): unknown[] {
	if (value === undefined || value === null) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value).trim();
	}
	const valueNode = node(value);
	if (!valueNode) {
		return '';
	}
	return text(valueNode['#text']);
}

function safeHtml(value: unknown): string {
	return sanitizeHtml(text(value), {
		allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
		allowedAttributes: { a: ['href'] },
		allowedSchemes: ['https'],
		allowProtocolRelative: false,
		disallowedTagsMode: 'discard'
	}).trim();
}

function kmlColor(value: unknown): { color?: string; opacity?: number } {
	const raw = text(value).replace(/^#/, '');
	if (!/^[0-9a-f]{8}$/i.test(raw)) {
		return {};
	}
	const alpha = Number.parseInt(raw.slice(0, 2), 16) / 255;
	const blue = raw.slice(2, 4);
	const green = raw.slice(4, 6);
	const red = raw.slice(6, 8);
	return { color: `#${red}${green}${blue}`.toLowerCase(), opacity: alpha };
}

function parseStyle(value: unknown, id = ''): MapFeatureStyle {
	const style = node(value);
	if (!style) {
		return {};
	}
	const iconStyle = node(style.IconStyle);
	const lineStyle = node(style.LineStyle);
	const polygonStyle = node(style.PolyStyle);
	const iconColor = kmlColor(iconStyle?.color);
	const lineColor = kmlColor(lineStyle?.color);
	const fillColor = kmlColor(polygonStyle?.color);
	const width = Number(text(lineStyle?.width));
	return {
		color: lineColor.color ?? iconColor.color,
		opacity: lineColor.opacity ?? iconColor.opacity,
		fillColor: fillColor.color,
		fillOpacity: fillColor.opacity,
		width: Number.isFinite(width) && width > 0 ? width : undefined,
		iconHref: text(node(iconStyle?.Icon)?.href) || undefined,
		iconCode: id.match(/^icon-(\d+)-/)?.[1]
	};
}

function parseCoordinates(value: unknown): Position[] {
	return text(value)
		.split(/\s+/)
		.filter(Boolean)
		.map((coordinate): Position | undefined => {
			const parts = coordinate.split(',');
			const longitude = Number(parts[0]);
			const latitude = Number(parts[1]);
			if (
				!Number.isFinite(longitude) ||
				!Number.isFinite(latitude) ||
				longitude < -180 ||
				longitude > 180 ||
				latitude < -90 ||
				latitude > 90
			) {
				return undefined;
			}
			return [longitude, latitude];
		})
		.filter((coordinate): coordinate is Position => coordinate !== undefined);
}

function point(value: unknown): PointGeometry | undefined {
	const coordinates = parseCoordinates(node(value)?.coordinates);
	return coordinates.length === 1
		? { type: 'Point', coordinates: coordinates[0] as Position }
		: undefined;
}

function lineString(value: unknown): LineStringGeometry | undefined {
	const coordinates = parseCoordinates(node(value)?.coordinates);
	return coordinates.length >= 2 ? { type: 'LineString', coordinates } : undefined;
}

function polygon(value: unknown): PolygonGeometry | undefined {
	const polygonNode = node(value);
	if (!polygonNode) {
		return undefined;
	}
	const boundaries = [
		...values(polygonNode.outerBoundaryIs),
		...values(polygonNode.innerBoundaryIs)
	];
	const coordinates = boundaries
		.map((boundary) => parseCoordinates(node(node(boundary)?.LinearRing)?.coordinates))
		.filter((ring) => ring.length >= 4);
	return coordinates.length > 0 ? { type: 'Polygon', coordinates } : undefined;
}

function geometries(value: unknown): MapGeometry[] {
	const geometryNode = node(value);
	if (!geometryNode) {
		return [];
	}
	const result: MapGeometry[] = [];
	for (const candidate of values(geometryNode.Point)) {
		const geometry = point(candidate);
		if (geometry) {
			result.push(geometry);
		}
	}
	for (const candidate of values(geometryNode.LineString)) {
		const geometry = lineString(candidate);
		if (geometry) {
			result.push(geometry);
		}
	}
	for (const candidate of values(geometryNode.Polygon)) {
		const geometry = polygon(candidate);
		if (geometry) {
			result.push(geometry);
		}
	}
	for (const candidate of values(geometryNode.MultiGeometry)) {
		const nested = geometries(candidate);
		if (nested.length > 0) {
			const collection: GeometryCollection = { type: 'GeometryCollection', geometries: nested };
			result.push(collection);
		}
	}
	return result;
}

function extendedData(value: unknown): Record<string, string> {
	const dataNode = node(value);
	if (!dataNode) {
		return {};
	}
	const entries = values(dataNode.Data).flatMap((item): [string, string][] => {
		const itemNode = node(item);
		const name = text(itemNode?.['@_name']);
		const content = safeHtml(itemNode?.value);
		return name ? [[name, content]] : [];
	});
	return Object.fromEntries(entries);
}

function featureId(layerPath: string[], title: string, geometry: MapGeometry): string {
	return createHash('sha256')
		.update(JSON.stringify({ layerPath, title: title.trim(), geometry }))
		.digest('hex');
}

function fallbackColor(layerId: string): string {
	const hash = createHash('sha256').update(layerId).digest();
	return fallbackColors[hash[0] % fallbackColors.length] as string;
}

function sourceStyle(style: MapFeatureStyle): MapSourceStyleLegend {
	const iconHref = style.iconHref ?? '';
	const iconCode = style.iconCode ?? '';
	const sourceSymbol = mapPointCategory(iconCode);
	const hash = createHash('sha256').update(sourceSymbol.symbol).digest('hex');
	return {
		key: `source-style-${hash}`,
		color: sourceSymbol.color,
		iconHref,
		iconCode,
		symbol: sourceSymbol.symbol,
		label: sourceSymbol.label,
		count: 0
	};
}

function geometryCounts(geometry: MapGeometry): { points: number; lines: number } {
	if (geometry.type === 'Point') {
		return { points: 1, lines: 0 };
	}
	if (geometry.type === 'LineString') {
		return { points: 0, lines: 1 };
	}
	if (geometry.type === 'GeometryCollection') {
		return geometry.geometries.reduce(
			(total, child) => {
				const counts = geometryCounts(child);
				return { points: total.points + counts.points, lines: total.lines + counts.lines };
			},
			{ points: 0, lines: 0 }
		);
	}
	return { points: 0, lines: 0 };
}

function positions(geometry: MapGeometry): Position[] {
	if (geometry.type === 'Point') {
		return [geometry.coordinates];
	}
	if (geometry.type === 'LineString') {
		return geometry.coordinates;
	}
	if (geometry.type === 'Polygon') {
		return geometry.coordinates.flat();
	}
	return geometry.geometries.flatMap(positions);
}

function placemarkDescription(
	placemark: Record<string, unknown>,
	data: Record<string, string>
): string {
	const preferred = data.opis || data.description;
	if (preferred) {
		return preferred;
	}
	const description = safeHtml(placemark.description);
	const plain = description
		.replace(/<br\s*\/?\s*>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.trim();
	return /^(?:description|naziv|opis):/im.test(plain) ? '' : description;
}

export function parseKml(kml: string, fetchedAt = new Date().toISOString()): MapSnapshot {
	if (XMLValidator.validate(kml) !== true) {
		throw new Error('INVALID_KML');
	}
	const root = node(parser.parse(kml));
	const documentNode = node(node(root?.kml)?.Document);
	if (!documentNode) {
		throw new Error('INVALID_KML');
	}

	const styles = new Map<string, MapFeatureStyle>();
	for (const styleValue of values(documentNode.Style)) {
		const styleNode = node(styleValue);
		const id = text(styleNode?.['@_id']);
		if (id) {
			styles.set(id, parseStyle(styleNode, id));
		}
	}
	for (const mapValue of values(documentNode.StyleMap)) {
		const mapNode = node(mapValue);
		const id = text(mapNode?.['@_id']);
		const normalPair = values(mapNode?.Pair)
			.map(node)
			.find((pair) => text(pair?.key) === 'normal');
		const styleId = text(normalPair?.styleUrl).replace(/^#/, '');
		const mapped = styles.get(styleId);
		if (id && mapped) {
			styles.set(id, mapped);
		}
	}

	const features: MapFeature[] = [];
	const layers: MapLayer[] = [];
	const sourceStyleCounts = new Map<MapSourceStyleKey, MapSourceStyleLegend>();
	function visitFolder(folderValue: unknown, parentPath: string[]): void {
		const folder = node(folderValue);
		if (!folder) {
			return;
		}
		const name = text(folder.name) || 'Uten navn';
		const path = [...parentPath, name];
		const id = createHash('sha256').update(path.join('\u0000')).digest('hex');
		const layerFeatures: MapFeature[] = [];
		for (const placemarkValue of values(folder.Placemark)) {
			const placemark = node(placemarkValue);
			const parsedGeometries = geometries(placemark);
			if (!placemark || parsedGeometries.length === 0) {
				continue;
			}
			const geometry: MapGeometry =
				parsedGeometries.length === 1
					? (parsedGeometries[0] as MapGeometry)
					: { type: 'GeometryCollection', geometries: parsedGeometries };
			const title = text(placemark.name) || 'Uten navn';
			const styleId = text(placemark.styleUrl).replace(/^#/, '');
			const style = { ...styles.get(styleId), ...parseStyle(placemark.Style) };
			const data = extendedData(placemark.ExtendedData);
			const pointSourceStyle = geometry.type === 'Point' ? sourceStyle(style) : undefined;
			if (pointSourceStyle) {
				const existing = sourceStyleCounts.get(pointSourceStyle.key);
				sourceStyleCounts.set(pointSourceStyle.key, {
					...pointSourceStyle,
					count: (existing?.count ?? 0) + 1
				});
			}
			const feature: MapFeature = {
				type: 'Feature',
				id: featureId(path, title, geometry),
				geometry,
				properties: {
					title,
					description: placemarkDescription(placemark, data),
					snippet: safeHtml(placemark.Snippet ?? placemark.snippet),
					address: text(placemark.address),
					layerId: id,
					layerName: name,
					layerPath: path,
					extendedData: data,
					style,
					sourceStyleKey: pointSourceStyle?.key
				}
			};
			features.push(feature);
			layerFeatures.push(feature);
		}
		const counts = layerFeatures.reduce(
			(total, feature) => {
				const count = geometryCounts(feature.geometry);
				return { points: total.points + count.points, lines: total.lines + count.lines };
			},
			{ points: 0, lines: 0 }
		);
		const firstColor = layerFeatures.map((feature) => feature.properties.style.color).find(Boolean);
		layers.push({
			id,
			name,
			path,
			color: firstColor ?? fallbackColor(id),
			featureCount: layerFeatures.length,
			pointCount: counts.points,
			lineCount: counts.lines
		});
		for (const child of values(folder.Folder)) {
			visitFolder(child, path);
		}
	}
	for (const folder of values(documentNode.Folder)) {
		visitFolder(folder, []);
	}
	if (features.length === 0) {
		throw new Error('EMPTY_KML');
	}

	const allPositions = features.flatMap((feature) => positions(feature.geometry));
	const longitudes = allPositions.map(([longitude]) => longitude);
	const latitudes = allPositions.map(([, latitude]) => latitude);
	const bounds: MapBounds = [
		Math.min(...longitudes),
		Math.min(...latitudes),
		Math.max(...longitudes),
		Math.max(...latitudes)
	];
	return {
		version: 1,
		type: 'FeatureCollection',
		title: text(documentNode.name) || 'Kart',
		description: safeHtml(documentNode.description),
		fetchedAt,
		sourceHash: createHash('sha256').update(kml).digest('hex'),
		bounds,
		layers,
		sourceStyles: [...sourceStyleCounts.values()].sort(
			(left, right) => right.count - left.count || left.color.localeCompare(right.color)
		),
		features
	};
}
