import { z } from 'zod';

export type Position = [longitude: number, latitude: number];

export type MapMode = 'normal' | 'nautical' | 'satellite';

export type OfflineMapPackage = {
	mode: MapMode;
	name: string;
	version: string;
	size: number;
	url: string;
};

export type OfflineMapManifest = {
	packages: OfflineMapPackage[];
};

export type PointGeometry = {
	type: 'Point';
	coordinates: Position;
};

export type LineStringGeometry = {
	type: 'LineString';
	coordinates: Position[];
};

export type PolygonGeometry = {
	type: 'Polygon';
	coordinates: Position[][];
};

export type GeometryCollection = {
	type: 'GeometryCollection';
	geometries: MapGeometry[];
};

export type MapGeometry = PointGeometry | LineStringGeometry | PolygonGeometry | GeometryCollection;

export type MapFeatureStyle = {
	color?: string;
	opacity?: number;
	fillColor?: string;
	fillOpacity?: number;
	width?: number;
	iconHref?: string;
	iconCode?: string;
};

export type MapSourceStyleKey = `source-style-${string}`;

export type MapPointSymbol =
	| 'anchorage'
	| 'bar'
	| 'buoy-field'
	| 'cafe'
	| 'dessert'
	| 'marina'
	| 'restaurant'
	| 'shop'
	| 'poi';

export type MapPointCategory = {
	symbol: MapPointSymbol;
	label: string;
	color: string;
};

export const mapPointCategories: Record<string, MapPointCategory> = {
	'1502': { symbol: 'poi', label: 'Interessepunkter', color: '#c08a16' },
	'1517': { symbol: 'bar', label: 'Barer', color: '#d15f45' },
	'1521': { symbol: 'poi', label: 'Interessepunkter', color: '#c08a16' },
	'1534': { symbol: 'cafe', label: 'Kafeer', color: '#a16207' },
	'1535': { symbol: 'poi', label: 'Interessepunkter', color: '#c08a16' },
	'1563': { symbol: 'buoy-field', label: 'Bøyefelt', color: '#d64545' },
	'1577': { symbol: 'restaurant', label: 'Restauranter', color: '#9a5b3f' },
	'1592': { symbol: 'cafe', label: 'Kafeer', color: '#a16207' },
	'1607': { symbol: 'dessert', label: 'Iskrem og desserter', color: '#c2417a' },
	'1623': { symbol: 'anchorage', label: 'Ankerplasser og fortøyninger', color: '#087f8c' },
	'1681': { symbol: 'marina', label: 'Marinaer og havner', color: '#2563a8' },
	'1685': { symbol: 'shop', label: 'Butikker og forsyninger', color: '#39724d' },
	'1762': { symbol: 'cafe', label: 'Kafeer', color: '#a16207' },
	'1798': { symbol: 'bar', label: 'Barer', color: '#d15f45' },
	'1899': { symbol: 'poi', label: 'Interessepunkter', color: '#c08a16' }
};

export const fallbackMapPointCategory: MapPointCategory = {
	symbol: 'poi',
	label: 'Andre steder',
	color: '#5f6b6d'
};

export function mapPointCategory(iconCode: string): MapPointCategory {
	return mapPointCategories[iconCode] ?? fallbackMapPointCategory;
}

export type MapSourceStyleLegend = {
	key: MapSourceStyleKey;
	color: string;
	iconHref: string;
	iconCode: string;
	symbol: MapPointSymbol;
	label: string;
	count: number;
};

export type MapFeatureProperties = {
	title: string;
	description: string;
	snippet: string;
	address: string;
	layerId: string;
	layerName: string;
	layerPath: string[];
	extendedData: Record<string, string>;
	style: MapFeatureStyle;
	sourceStyleKey?: MapSourceStyleKey;
};

export type MapFeature = {
	type: 'Feature';
	id: string;
	geometry: MapGeometry;
	properties: MapFeatureProperties;
};

export type MapLayer = {
	id: string;
	name: string;
	path: string[];
	color: string;
	featureCount: number;
	pointCount: number;
	lineCount: number;
};

export type MapBounds = [west: number, south: number, east: number, north: number];

export type MapSnapshot = {
	version: 1;
	type: 'FeatureCollection';
	title: string;
	description: string;
	fetchedAt: string;
	sourceHash: string;
	bounds: MapBounds;
	layers: MapLayer[];
	sourceStyles: MapSourceStyleLegend[];
	features: MapFeature[];
};

export type MapApiResponse = {
	snapshot: MapSnapshot;
	stale: boolean;
	refreshing: boolean;
	error?: string;
	sourceMapId?: string;
};

export function isCurrentMapSnapshot(value: unknown): value is MapSnapshot {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const snapshot = value as Partial<MapSnapshot>;
	if (
		snapshot.version !== 1 ||
		!Array.isArray(snapshot.sourceStyles) ||
		!Array.isArray(snapshot.features)
	) {
		return false;
	}
	const sourceStyleKeys = new Set<string>();
	for (const style of snapshot.sourceStyles) {
		if (!style || typeof style !== 'object') {
			return false;
		}
		const expected = mapPointCategory(style.iconCode);
		if (
			typeof style.key !== 'string' ||
			style.symbol !== expected.symbol ||
			style.label !== expected.label ||
			style.color !== expected.color
		) {
			return false;
		}
		sourceStyleKeys.add(style.key);
	}
	return snapshot.features.every((feature) => {
		if (!feature || typeof feature !== 'object' || feature.geometry?.type !== 'Point') {
			return true;
		}
		const key = feature.properties?.sourceStyleKey;
		return typeof key === 'string' && sourceStyleKeys.has(key);
	});
}

export const mapSnapshotSchema = z.custom<MapSnapshot>(isCurrentMapSnapshot);
