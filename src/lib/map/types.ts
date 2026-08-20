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
	'anchorage' | 'bar' | 'buoy-field' | 'marina' | 'restaurant' | 'shop' | 'poi';

export type MapPointCategory = {
	symbol: MapPointSymbol;
	label: string;
	color: string;
};

export const mapPointCategories: Record<string, MapPointCategory> = {
	'1502': { symbol: 'poi', label: 'Interessepunkter', color: '#c08a16' },
	'1517': { symbol: 'bar', label: 'Barer', color: '#d15f45' },
	'1563': { symbol: 'buoy-field', label: 'Bøyefelt', color: '#d64545' },
	'1577': { symbol: 'restaurant', label: 'Restauranter', color: '#9a5b3f' },
	'1623': { symbol: 'anchorage', label: 'Ankerplasser og fortøyninger', color: '#087f8c' },
	'1681': { symbol: 'marina', label: 'Marinaer og havner', color: '#2563a8' },
	'1685': { symbol: 'shop', label: 'Butikker og forsyninger', color: '#39724d' }
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
	version: 5;
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
