/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { appShellPaths, isApiPath, isAppShellPath } from '$lib/pwa/cache';
import { base, build, files, version } from '$service-worker';

const worker = globalThis.self as unknown as ServiceWorkerGlobalScope;
const cachePrefix = 'gjemmekontor-';
const assetCacheName = `${cachePrefix}assets-${version}`;
const pageCacheName = `${cachePrefix}pages-${version}`;
const assets = [...new Set([...build, ...files])];

async function cachePage(request: Request, response: Response): Promise<void> {
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || response.redirected || !contentType.includes('text/html')) {
		return;
	}
	const responseUrl = new URL(response.url);
	if (!isAppShellPath(responseUrl.pathname, base)) {
		return;
	}
	const cache = await caches.open(pageCacheName);
	await cache.put(request, response);
}

async function navigationResponse(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		await cachePage(request, response.clone());
		return response;
	} catch (error) {
		const cached = await caches.match(request);
		if (cached) {
			return cached;
		}
		throw error;
	}
}

async function warmPages(): Promise<void> {
	await Promise.all(
		appShellPaths.map(async (path): Promise<void> => {
			const request = new Request(`${base}${path}`, {
				headers: { accept: 'text/html' },
				credentials: 'same-origin'
			});
			const response = await fetch(request);
			await cachePage(request, response);
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
		event.waitUntil(warmPages());
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
	if (request.mode === 'navigate' && isAppShellPath(url.pathname, base)) {
		event.respondWith(navigationResponse(request));
	}
});
