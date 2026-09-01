import { createHash } from 'node:crypto';

import {
	type MapBounds,
	type MapFeature,
	type MapFeatureStyle,
	type MapGeometry,
	type MapLayer,
	mapPointCategory,
	type MapSnapshot,
	type MapSourceStyleKey,
	type MapSourceStyleLegend
} from '$lib/modules/map/domain/types';

import { geometries, geometryCounts, positions } from './kml-geometry';
import {
	extendedData,
	node,
	parseKmlDocument,
	parseStyle,
	plainText,
	safeHtml,
	text,
	values
} from './kml-xml';

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

function anchorageDetails(
	description: string,
	data: Record<string, string>
): { description: string; data: Record<string, string> } {
	const body: string[] = [];
	let seaBed: string | undefined;
	let windProtection: string | undefined;
	for (const line of description.split(/<br\s*\/?\s*>|\r?\n/gi)) {
		const value = plainText(line);
		if (!value || /^coordinates:\s*/i.test(value)) continue;
		const seaBedMatch = value.match(/^sea bed:\s*(.+)$/i);
		if (seaBedMatch) {
			seaBed = seaBedMatch[1];
			continue;
		}
		const windProtectionMatch = value.match(/^wind protection:\s*(.+)$/i);
		if (windProtectionMatch) {
			windProtection = windProtectionMatch[1];
			continue;
		}
		body.push(line.trim());
	}
	const normalizedDescription = body.join('<br>');
	return {
		description: normalizedDescription,
		data: {
			...data,
			...(data.opis !== undefined ? { opis: normalizedDescription } : {}),
			...(seaBed ? { 'Sea bed': seaBed } : {}),
			...(windProtection ? { 'Wind Protection': windProtection } : {})
		}
	};
}

export function parseKml(kml: string, fetchedAt = new Date().toISOString()): MapSnapshot {
	const documentNode = parseKmlDocument(kml);

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
	const featureIds = new Set<string>();
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
			const description = placemarkDescription(placemark, data);
			const details =
				path[0] === 'Anker, bøye og marina' ||
				(/(?:^|<br\s*\/?\s*>|\r?\n)sea bed:/i.test(description) &&
					/(?:^|<br\s*\/?\s*>|\r?\n)wind protection:/i.test(description))
					? anchorageDetails(description, data)
					: { description, data };
			const parsedFeatureId = featureId(path, title, geometry);
			if (featureIds.has(parsedFeatureId)) continue;
			featureIds.add(parsedFeatureId);
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
				id: parsedFeatureId,
				geometry,
				properties: {
					title,
					description: details.description,
					snippet: safeHtml(placemark.Snippet ?? placemark.snippet),
					address: text(placemark.address),
					layerId: id,
					layerName: name,
					layerPath: path,
					extendedData: details.data,
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
