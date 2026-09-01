import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { createMapService, mapCachePaths, MapServiceError } from './google';

const fixture = readFileSync(resolve('tests/fixtures/google-map.kml'), 'utf8');
const directories: string[] = [];

function temporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), 'gjemmekontor-map-'));
	directories.push(directory);
	return directory;
}

afterEach((): void => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('Google map cache', (): void => {
	test('uses a separate filesystem root for every trip', (): void => {
		const root = temporaryDirectory();
		expect(mapCachePaths(root, 'trip-a').directory).toBe(join(root, 'trips', 'trip-a', 'map'));
		expect(mapCachePaths(root, 'trip-b').directory).toBe(join(root, 'trips', 'trip-b', 'map'));
		expect(mapCachePaths(root, 'trip-a').snapshot).not.toBe(mapCachePaths(root, 'trip-b').snapshot);
	});

	test('writes a valid response and revalidates with conditional headers', async (): Promise<void> => {
		let now = Date.parse('2026-08-20T00:00:00.000Z');
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(fixture, {
					headers: { etag: 'fixture-etag', 'last-modified': 'Wed, 19 Aug 2026 10:00:00 GMT' }
				})
			)
			.mockResolvedValueOnce(new Response(null, { status: 304 }));
		const paths = mapCachePaths(temporaryDirectory(), 'trip-a');
		const service = createMapService({
			mapId: 'map-id',
			paths,
			fetch: fetchImplementation,
			now: () => now
		});

		const initial = await service.refresh();
		now += 16 * 60 * 1000;
		const refreshed = await service.refresh();
		const secondHeaders = fetchImplementation.mock.calls[1]?.[1]?.headers as Headers;

		expect(initial.snapshot.features).toHaveLength(4);
		expect(new Set(initial.snapshot.features.map((feature) => feature.id)).size).toBe(4);
		expect(refreshed.snapshot.fetchedAt).toBe('2026-08-20T00:16:00.000Z');
		expect(secondHeaders.get('If-None-Match')).toBe('fixture-etag');
		expect(secondHeaders.get('If-Modified-Since')).toBe('Wed, 19 Aug 2026 10:00:00 GMT');
		expect(readFileSync(paths.kml, 'utf8')).toBe(fixture);
	});

	test('shares one in-process refresh', async (): Promise<void> => {
		let resolveFetch: ((response: Response) => void) | undefined;
		const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
			() =>
				new Promise<Response>((resolveResponse) => {
					resolveFetch = resolveResponse;
				})
		);
		const service = createMapService({
			mapId: 'map-id',
			paths: mapCachePaths(temporaryDirectory(), 'trip-a'),
			fetch: fetchImplementation
		});

		const first = service.refresh();
		const second = service.refresh();
		await vi.waitFor((): void => {
			expect(fetchImplementation).toHaveBeenCalledTimes(1);
		});
		resolveFetch?.(new Response(fixture));

		expect(first).toBe(second);
		expect((await first).snapshot.features).toHaveLength(4);
		expect(fetchImplementation).toHaveBeenCalledTimes(1);
	});

	test('keeps the last good snapshot after malformed responses', async (): Promise<void> => {
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(fixture))
			.mockResolvedValue(new Response('<kml><broken>'));
		const paths = mapCachePaths(temporaryDirectory(), 'trip-a');
		const service = createMapService({ mapId: 'map-id', paths, fetch: fetchImplementation });
		const initial = await service.refresh();
		const cachedJson = readFileSync(paths.snapshot, 'utf8');
		const failed = await service.refresh();

		expect(failed).toMatchObject({ stale: true, error: 'MAP_INVALID_RESPONSE' });
		expect(failed.snapshot.sourceHash).toBe(initial.snapshot.sourceHash);
		expect(readFileSync(paths.snapshot, 'utf8')).toBe(cachedJson);
	});

	test('refreshes a snapshot with stale category semantics', async (): Promise<void> => {
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockImplementation(async (): Promise<Response> => new Response(fixture));
		const paths = mapCachePaths(temporaryDirectory(), 'trip-a');
		const service = createMapService({ mapId: 'map-id', paths, fetch: fetchImplementation });
		const current = await service.refresh();
		writeFileSync(
			paths.snapshot,
			JSON.stringify({
				...current.snapshot,
				sourceStyles: current.snapshot.sourceStyles.map((style) =>
					style.iconCode === '1577'
						? { ...style, symbol: 'restaurant-mooring', label: 'Restaurantfortøyninger' }
						: style
				)
			})
		);

		const refreshed = await service.get();

		expect(refreshed.snapshot.sourceStyles).toContainEqual(
			expect.objectContaining({ iconCode: '1577', symbol: 'restaurant', label: 'Restauranter' })
		);
		expect(fetchImplementation).toHaveBeenCalledTimes(2);
	});

	test('reports access denial when both official variants reject access', async (): Promise<void> => {
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status: 403 }));
		const service = createMapService({
			mapId: 'map-id',
			paths: mapCachePaths(temporaryDirectory(), 'trip-a'),
			fetch: fetchImplementation
		});

		await expect(service.refresh()).rejects.toEqual(new MapServiceError('MAP_ACCESS_DENIED', 502));
		expect(fetchImplementation).toHaveBeenCalledTimes(2);
		expect(
			fetchImplementation.mock.calls.every(([input]) => {
				const url = input instanceof Request ? input.url : input;
				return new URL(url).hostname === 'www.google.com';
			})
		).toBe(true);
	});

	test('rejects oversized and non-KML responses without creating a cache', async (): Promise<void> => {
		const oversized = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response('too large', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } })
			);
		const invalidType = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('<kml></kml>', { headers: { 'content-type': 'text/html' } }));

		await expect(
			createMapService({
				mapId: 'map-id',
				paths: mapCachePaths(temporaryDirectory(), 'trip-a'),
				fetch: oversized
			}).refresh()
		).rejects.toMatchObject({ code: 'MAP_TOO_LARGE' });
		await expect(
			createMapService({
				mapId: 'map-id',
				paths: mapCachePaths(temporaryDirectory(), 'trip-a'),
				fetch: invalidType
			}).refresh()
		).rejects.toMatchObject({ code: 'MAP_INVALID_RESPONSE' });
	});

	test('maps fetch aborts to a stable timeout error', async (): Promise<void> => {
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
		const service = createMapService({
			mapId: 'map-id',
			paths: mapCachePaths(temporaryDirectory(), 'trip-a'),
			fetch: fetchImplementation
		});

		await expect(service.refresh()).rejects.toMatchObject({ code: 'MAP_TIMEOUT' });
	});

	test('serves stale cache immediately while one refresh runs', async (): Promise<void> => {
		let now = Date.parse('2026-08-20T00:00:00.000Z');
		let resolveRefresh: ((response: Response) => void) | undefined;
		const fetchImplementation = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(fixture))
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolveResponse) => {
						resolveRefresh = resolveResponse;
					})
			);
		const service = createMapService({
			mapId: 'map-id',
			paths: mapCachePaths(temporaryDirectory(), 'trip-a'),
			fetch: fetchImplementation,
			now: () => now
		});
		await service.refresh();
		now += 15 * 60 * 1000;

		const cached = await service.get();
		await vi.waitFor((): void => {
			expect(fetchImplementation).toHaveBeenCalledTimes(2);
		});

		expect(cached).toMatchObject({ stale: true, refreshing: true });
		resolveRefresh?.(new Response(fixture));
		await service.refresh();
		expect(fetchImplementation).toHaveBeenCalledTimes(2);
	});
});
