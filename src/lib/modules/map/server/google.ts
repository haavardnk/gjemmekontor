import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	isCurrentMapSnapshot,
	type MapApiResponse,
	type MapSnapshot
} from '$lib/modules/map/domain/types';

import { parseKml } from './kml';

const staleAfterMs = 15 * 60 * 1000;
const timeoutMs = 15_000;
const maximumBytes = 10 * 1024 * 1024;

type CacheMetadata = {
	url: string;
	etag?: string;
	lastModified?: string;
};

export type MapErrorCode =
	| 'MAP_ACCESS_DENIED'
	| 'MAP_NOT_FOUND'
	| 'MAP_TIMEOUT'
	| 'MAP_TOO_LARGE'
	| 'MAP_INVALID_RESPONSE'
	| 'MAP_UNAVAILABLE';

export class MapServiceError extends Error {
	constructor(
		public readonly code: MapErrorCode,
		public readonly status: number
	) {
		super(code);
	}
}

export type MapCachePaths = {
	directory: string;
	kml: string;
	snapshot: string;
	metadata: string;
};

export type MapServiceDependencies = {
	mapId: string;
	paths: MapCachePaths;
	fetch?: typeof fetch;
	now?: () => number;
};

export function mapCachePaths(dataDir: string, tripId: string): MapCachePaths {
	const directory = join(dataDir, 'trips', tripId, 'map');
	return {
		directory,
		kml: join(directory, 'latest.kml'),
		snapshot: join(directory, 'snapshot.json'),
		metadata: join(directory, 'metadata.json')
	};
}

function urls(mapId: string): URL[] {
	return [
		new URL(`https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mapId)}&forcekml=1`),
		new URL(`https://www.google.com/maps/d/u/0/kml?mid=${encodeURIComponent(mapId)}&forcekml=1`)
	];
}

async function optionalJson<T>(path: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch {
		return undefined;
	}
}

async function atomicWrite(path: string, content: string): Promise<void> {
	const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
	await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
	await rename(temporaryPath, path);
}

async function responseText(response: Response): Promise<string> {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
		throw new MapServiceError('MAP_TOO_LARGE', 502);
	}
	if (!response.body) {
		throw new MapServiceError('MAP_INVALID_RESPONSE', 502);
	}
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType && !/(kml|xml|octet-stream|text\/plain)/i.test(contentType)) {
		throw new MapServiceError('MAP_INVALID_RESPONSE', 502);
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const result = await reader.read();
		if (result.done) {
			break;
		}
		size += result.value.byteLength;
		if (size > maximumBytes) {
			await reader.cancel();
			throw new MapServiceError('MAP_TOO_LARGE', 502);
		}
		chunks.push(result.value);
	}
	const content = new TextDecoder().decode(Buffer.concat(chunks));
	if (!/^\s*<\?xml|^\s*<kml[\s>]/i.test(content)) {
		throw new MapServiceError('MAP_INVALID_RESPONSE', 502);
	}
	return content;
}

export function createMapService(dependencies: MapServiceDependencies): {
	get: () => Promise<MapApiResponse>;
	refresh: () => Promise<MapApiResponse>;
} {
	const fetchImplementation = dependencies.fetch ?? fetch;
	const now = dependencies.now ?? Date.now;
	let refreshPromise: Promise<MapApiResponse> | undefined;

	async function cachedSnapshot(): Promise<MapSnapshot | undefined> {
		const snapshot = await optionalJson<unknown>(dependencies.paths.snapshot);
		return isCurrentMapSnapshot(snapshot) ? snapshot : undefined;
	}

	async function fetchSnapshot(): Promise<MapApiResponse> {
		const cached = await cachedSnapshot();
		const metadata = await optionalJson<CacheMetadata>(dependencies.paths.metadata);
		let lastError = new MapServiceError('MAP_UNAVAILABLE', 502);
		for (const url of urls(dependencies.mapId)) {
			if (url.protocol !== 'https:' || url.hostname !== 'www.google.com') {
				throw new MapServiceError('MAP_INVALID_RESPONSE', 500);
			}
			const headers = new Headers();
			if (cached && metadata?.url === url.href && metadata.etag) {
				headers.set('If-None-Match', metadata.etag);
			}
			if (cached && metadata?.url === url.href && metadata.lastModified) {
				headers.set('If-Modified-Since', metadata.lastModified);
			}
			let response: Response;
			try {
				response = await fetchImplementation(url, {
					headers,
					signal: AbortSignal.timeout(timeoutMs)
				});
			} catch (error) {
				lastError = new MapServiceError(
					error instanceof Error && error.name === 'AbortError' ? 'MAP_TIMEOUT' : 'MAP_UNAVAILABLE',
					502
				);
				continue;
			}
			if (response.status === 304 && cached) {
				const refreshed = { ...cached, fetchedAt: new Date(now()).toISOString() };
				await mkdir(dependencies.paths.directory, { recursive: true });
				await atomicWrite(dependencies.paths.snapshot, JSON.stringify(refreshed));
				return { snapshot: refreshed, stale: false, refreshing: false };
			}
			if (response.status === 403) {
				lastError = new MapServiceError('MAP_ACCESS_DENIED', 502);
				continue;
			}
			if (response.status === 404) {
				lastError = new MapServiceError('MAP_NOT_FOUND', 502);
				continue;
			}
			if (!response.ok) {
				lastError = new MapServiceError('MAP_UNAVAILABLE', 502);
				continue;
			}
			try {
				const kml = await responseText(response);
				const snapshot = parseKml(kml, new Date(now()).toISOString());
				const nextMetadata: CacheMetadata = {
					url: url.href,
					etag: response.headers.get('etag') ?? undefined,
					lastModified: response.headers.get('last-modified') ?? undefined
				};
				await mkdir(dependencies.paths.directory, { recursive: true });
				await atomicWrite(dependencies.paths.kml, kml);
				await atomicWrite(dependencies.paths.snapshot, JSON.stringify(snapshot));
				await atomicWrite(dependencies.paths.metadata, JSON.stringify(nextMetadata));
				return { snapshot, stale: false, refreshing: false };
			} catch (error) {
				lastError =
					error instanceof MapServiceError
						? error
						: error instanceof Error && error.name === 'AbortError'
							? new MapServiceError('MAP_TIMEOUT', 502)
							: new MapServiceError('MAP_INVALID_RESPONSE', 502);
			}
		}
		if (cached) {
			return { snapshot: cached, stale: true, refreshing: false, error: lastError.code };
		}
		throw lastError;
	}

	function refresh(): Promise<MapApiResponse> {
		if (!refreshPromise) {
			refreshPromise = fetchSnapshot().finally(() => {
				refreshPromise = undefined;
			});
		}
		return refreshPromise;
	}

	async function get(): Promise<MapApiResponse> {
		const cached = await cachedSnapshot();
		if (!cached) {
			return refresh();
		}
		const stale = now() - Date.parse(cached.fetchedAt) >= staleAfterMs;
		if (stale) {
			void refresh();
		}
		return { snapshot: cached, stale, refreshing: stale };
	}

	return { get, refresh };
}
