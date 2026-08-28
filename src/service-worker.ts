/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { isApiPath, isAppShellPath, knownAppShellPaths } from '$lib/app/pwa/cache';
import { base, build, files, version } from '$service-worker';

const worker = globalThis.self as unknown as ServiceWorkerGlobalScope;
const cachePrefix = 'gjemmekontor-';
const assetCacheName = `${cachePrefix}assets-${version}`;
const pageCacheName = `${cachePrefix}pages-${version}`;
const assets = [...new Set([...build, ...files])];
let enabledAppShellPaths = [...knownAppShellPaths];
let activeTripId: string | undefined;
const activeTripMarker = `${base}/__active_trip__`;

function tripPageRequest(request: Request | string, tripId: string): Request {
	const url = new URL(typeof request === 'string' ? request : request.url, worker.location.origin);
	url.search = '';
	url.searchParams.set('__trip_cache', tripId);
	return new Request(url, {
		headers: { accept: 'text/html' },
		credentials: 'same-origin'
	});
}

async function rememberActiveTrip(tripId: string): Promise<void> {
	activeTripId = tripId;
	const cache = await caches.open(pageCacheName);
	await cache.put(activeTripMarker, new Response(tripId));
}

async function rememberedActiveTrip(): Promise<string | undefined> {
	if (activeTripId) return activeTripId;
	const cached = await (await caches.open(pageCacheName)).match(activeTripMarker);
	const value = (await cached?.text())?.trim();
	activeTripId = value || undefined;
	return activeTripId;
}

async function cachePage(request: Request, response: Response, tripId: string): Promise<void> {
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || response.redirected || !contentType.includes('text/html')) {
		return;
	}
	const responseUrl = new URL(response.url);
	if (!isAppShellPath(responseUrl.pathname, base, enabledAppShellPaths)) {
		return;
	}
	const cache = await caches.open(pageCacheName);
	await cache.put(tripPageRequest(request, tripId), response);
}

async function navigationResponse(request: Request): Promise<Response> {
	const tripId = await rememberedActiveTrip();
	try {
		const response = await fetch(request);
		if (tripId) await cachePage(request, response.clone(), tripId);
		return response;
	} catch (error) {
		const cached = tripId ? await caches.match(tripPageRequest(request, tripId)) : undefined;
		if (cached) {
			return cached;
		}
		throw error;
	}
}

async function warmPages(paths: readonly string[], tripId: string): Promise<void> {
	await rememberActiveTrip(tripId);
	enabledAppShellPaths = paths.filter((path) => knownAppShellPaths.includes(path));
	const cache = await caches.open(pageCacheName);
	await Promise.all(
		knownAppShellPaths
			.filter((path) => !enabledAppShellPaths.includes(path))
			.map((path) => cache.delete(tripPageRequest(`${base}${path}`, tripId)))
	);
	await Promise.all(
		enabledAppShellPaths.map(async (path): Promise<void> => {
			const request = new Request(`${base}${path}`, {
				headers: { accept: 'text/html' },
				credentials: 'same-origin'
			});
			const response = await fetch(request);
			await cachePage(request, response, tripId);
		})
	);
}

worker.addEventListener('install', (event): void => {
	event.waitUntil(
		Promise.all([
			caches.open(assetCacheName).then((cache) => cache.addAll(assets)),
			worker.skipWaiting()
		])
	);
});

worker.addEventListener('activate', (event): void => {
	event.waitUntil(
		Promise.all([
			caches.keys().then(async (keys): Promise<void> => {
				await Promise.all(
					keys
						.filter(
							(key) =>
								key.startsWith(cachePrefix) && key !== assetCacheName && key !== pageCacheName
						)
						.map((key) => caches.delete(key))
				);
			}),
			worker.clients.claim()
		])
	);
});

worker.addEventListener('message', (event): void => {
	if (event.data?.type === 'CACHE_APP_SHELL') {
		const paths = Array.isArray(event.data.paths)
			? event.data.paths.filter((path: unknown): path is string => typeof path === 'string')
			: [];
		const tripId = typeof event.data.tripId === 'string' ? event.data.tripId.trim() : '';
		if (tripId) event.waitUntil(warmPages(paths, tripId));
	}
});

worker.addEventListener('fetch', (event): void => {
	const request = event.request;
	if (request.method !== 'GET') {
		return;
	}
	const url = new URL(request.url);
	if (url.origin !== worker.location.origin || isApiPath(url.pathname, base)) {
		return;
	}
	if (assets.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((response) => response ?? fetch(request)));
		return;
	}
	if (request.mode === 'navigate' && isAppShellPath(url.pathname, base, enabledAppShellPaths)) {
		event.respondWith(navigationResponse(request));
	}
});
