import { apiError } from '$lib/server/api';

const maximumTileBytes = 2 * 1024 * 1024;

export type TileBounds = {
	west: number;
	south: number;
	east: number;
	north: number;
};

type TileCoordinate = {
	z: number;
	x: number;
	y: number;
};

function tileCoordinate(
	zValue: string,
	xValue: string,
	yValue: string
): TileCoordinate | undefined {
	const z = Number(zValue);
	const x = Number(xValue);
	const y = Number(yValue);
	const scale = 2 ** z;
	return Number.isInteger(z) &&
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		z >= 0 &&
		z <= 18 &&
		x >= 0 &&
		y >= 0 &&
		x < scale &&
		y < scale
		? { z, x, y }
		: undefined;
}

export function tileBounds(z: number, x: number, y: number): TileBounds {
	const scale = 2 ** z;
	const longitude = (tileX: number): number => (tileX / scale) * 360 - 180;
	const latitude = (tileY: number): number =>
		(Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / scale))) * 180) / Math.PI;
	return {
		west: longitude(x),
		south: latitude(y + 1),
		east: longitude(x + 1),
		north: latitude(y)
	};
}

export async function handleDepthContourTile(
	zValue: string,
	xValue: string,
	yValue: string,
	fetcher: typeof fetch = fetch
): Promise<Response> {
	const coordinate = tileCoordinate(zValue, xValue, yValue);
	if (!coordinate) {
		return apiError('INVALID_MAP_TILE', 400);
	}

	const bounds = tileBounds(coordinate.z, coordinate.x, coordinate.y);
	const url = new URL('https://depth.openseamap.org/geoserver/openseamap/wms');
	url.search = new URLSearchParams({
		SERVICE: 'WMS',
		VERSION: '1.1.1',
		REQUEST: 'GetMap',
		LAYERS: 'openseamap:contour2,openseamap:contour',
		STYLES: '',
		SRS: 'EPSG:4326',
		BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
		WIDTH: '256',
		HEIGHT: '256',
		FORMAT: 'image/png',
		TRANSPARENT: 'true'
	}).toString();

	let response: Response;
	try {
		response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
	} catch {
		return apiError('DEPTH_CONTOURS_UNAVAILABLE', 502);
	}
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || !contentType.startsWith('image/png')) {
		return apiError('DEPTH_CONTOURS_UNAVAILABLE', 502);
	}
	const data = await response.arrayBuffer();
	if (data.byteLength > maximumTileBytes) {
		return apiError('DEPTH_CONTOURS_TILE_TOO_LARGE', 502);
	}
	return new Response(data, {
		headers: {
			'Cache-Control': 'private, max-age=86400',
			'Content-Type': 'image/png'
		}
	});
}

export async function handleMarineProfileTile(
	zValue: string,
	xValue: string,
	yValue: string,
	fetcher: typeof fetch = fetch
): Promise<Response> {
	const coordinate = tileCoordinate(zValue, xValue, yValue);
	if (!coordinate) {
		return apiError('INVALID_MAP_TILE', 400);
	}
	const halfWorld = 20_037_508.342789244;
	const tileSize = (2 * halfWorld) / 2 ** coordinate.z;
	const west = -halfWorld + coordinate.x * tileSize;
	const east = west + tileSize;
	const north = halfWorld - coordinate.y * tileSize;
	const south = north - tileSize;
	const url = new URL('https://geoserver.openseamap.org/geoserver/wms');
	url.search = new URLSearchParams({
		SERVICE: 'WMS',
		VERSION: '1.1.1',
		REQUEST: 'GetMap',
		LAYERS: 'gebco2021:gebco_2021',
		STYLES: '',
		SRS: 'EPSG:3857',
		BBOX: `${west},${south},${east},${north}`,
		WIDTH: '256',
		HEIGHT: '256',
		FORMAT: 'image/png',
		TRANSPARENT: 'true'
	}).toString();

	let response: Response;
	try {
		response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
	} catch {
		return apiError('MARINE_PROFILE_UNAVAILABLE', 502);
	}
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || !contentType.startsWith('image/png')) {
		return apiError('MARINE_PROFILE_UNAVAILABLE', 502);
	}
	const data = await response.arrayBuffer();
	if (data.byteLength > maximumTileBytes) {
		return apiError('MARINE_PROFILE_TILE_TOO_LARGE', 502);
	}
	return new Response(data, {
		headers: {
			'Cache-Control': 'private, max-age=86400',
			'Content-Type': 'image/png'
		}
	});
}
