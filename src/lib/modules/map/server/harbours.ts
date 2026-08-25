import { apiError } from '$lib/server/api';

const maximumResponseBytes = 1024 * 1024;
const harbourPattern =
	/putHarbourMarker\((\d+),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*'([^']*)',\s*'([^']*)',\s*(-?\d+)\);/g;

type Bounds = {
	west: number;
	south: number;
	east: number;
	north: number;
};

function parseBounds(url: URL): Bounds | undefined {
	const west = Number(url.searchParams.get('west'));
	const south = Number(url.searchParams.get('south'));
	const east = Number(url.searchParams.get('east'));
	const north = Number(url.searchParams.get('north'));
	if (
		![west, south, east, north].every(Number.isFinite) ||
		west < -180 ||
		east > 180 ||
		south < -85 ||
		north > 85 ||
		west >= east ||
		south >= north ||
		east - west > 20 ||
		north - south > 20
	) {
		return undefined;
	}
	return { west, south, east, north };
}

export function parseHarbours(text: string, bounds: Bounds): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = [];
	for (const match of text.matchAll(harbourPattern)) {
		const longitude = Number(match[2]);
		const latitude = Number(match[3]);
		if (
			longitude < bounds.west ||
			longitude > bounds.east ||
			latitude < bounds.south ||
			latitude > bounds.north
		) {
			continue;
		}
		features.push({
			type: 'Feature',
			id: `harbour-${match[1]}`,
			geometry: { type: 'Point', coordinates: [longitude, latitude] },
			properties: {
				name: match[4]?.replaceAll('_', ' ').trim() || 'Havn',
				type: Number(match[6])
			}
		});
	}
	return { type: 'FeatureCollection', features };
}

export async function handleHarbours(url: URL, fetcher: typeof fetch = fetch): Promise<Response> {
	const bounds = parseBounds(url);
	const zoom = Number(url.searchParams.get('zoom'));
	if (!bounds || !Number.isInteger(zoom) || zoom < 0 || zoom > 18) {
		return apiError('INVALID_HARBOUR_BOUNDS', 400);
	}
	const maximumType = zoom >= 10 ? 6 : zoom >= 9 ? 4 : zoom >= 8 ? 3 : zoom >= 7 ? 2 : 1;
	const upstream = new URL('https://harbour.openseamap.org/getHarbours.php');
	upstream.search = new URLSearchParams({
		b: bounds.south.toFixed(5),
		t: bounds.north.toFixed(5),
		l: bounds.west.toFixed(5),
		r: bounds.east.toFixed(5),
		maxSize: String(maximumType),
		zoom: String(zoom)
	}).toString();
	let response: Response;
	try {
		response = await fetcher(upstream, { signal: AbortSignal.timeout(15_000) });
	} catch {
		return apiError('HARBOURS_UNAVAILABLE', 502);
	}
	if (!response.ok) {
		return apiError('HARBOURS_UNAVAILABLE', 502);
	}
	const text = await response.text();
	if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
		return apiError('HARBOURS_RESPONSE_TOO_LARGE', 502);
	}
	return Response.json(parseHarbours(text, bounds), {
		headers: { 'Cache-Control': 'private, max-age=300' }
	});
}
