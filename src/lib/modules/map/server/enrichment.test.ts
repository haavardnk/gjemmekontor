import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';
import type { MapFeature, MapSourceStyleLegend } from '$lib/modules/map/domain/types';

import { createPoiEnrichmentService } from './enrichment';
import type { GooglePlacesAdapter } from './google-places';
import type { TripadvisorAdapter } from './tripadvisor';

const sourceStyles: MapSourceStyleLegend[] = [
	{
		key: 'source-style-restaurant',
		color: '#9a5b3f',
		iconHref: '',
		iconCode: '1577',
		symbol: 'restaurant',
		label: 'Restauranter',
		count: 1
	}
];
const feature: MapFeature = {
	type: 'Feature',
	id: 'a'.repeat(64),
	geometry: { type: 'Point', coordinates: [16.2, 43.2] },
	properties: {
		title: 'Konoba Test',
		description: '',
		snippet: '',
		address: 'Split, Croatia',
		layerId: 'layer',
		layerName: 'Layer',
		layerPath: ['Layer'],
		extendedData: {},
		style: { iconCode: '1577' },
		sourceStyleKey: 'source-style-restaurant'
	}
};

let directory = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	directory = mkdtempSync(join(tmpdir(), 'gjemmekontor-enrichment-'));
	db = createApplicationDatabase(directory);
});

afterEach((): void => {
	db.close();
	rmSync(directory, { recursive: true, force: true });
});

describe('POI enrichment orchestration', (): void => {
	test('keeps both providers independently disabled without configuration', async (): Promise<void> => {
		const service = createPoiEnrichmentService({ db });
		expect(await service.enrich(feature, sourceStyles)).toEqual({
			featureId: feature.id,
			google: { status: 'disabled' },
			tripadvisor: { status: 'disabled' }
		});
	});

	test('shares durable identities and Tripadvisor content across later views', async (): Promise<void> => {
		const google = {
			searchId: vi.fn(async () => 'ChIJ1234567890_test'),
			refreshId: vi.fn(async (id: string) => id)
		} satisfies GooglePlacesAdapter;
		const tripadvisor = {
			searchId: vi.fn(async () => '123456'),
			details: vi.fn(async () => ({
				locationId: '123456',
				rating: 4.5,
				reviewCount: 42,
				webUrl: 'https://www.tripadvisor.com/test',
				photosUrl: 'https://www.tripadvisor.com/test/photos'
			})),
			photos: vi.fn(async () => [
				{
					thumbnailUrl: 'https://dynamic-media-cdn.tripadvisor.com/thumb.jpg',
					imageUrl: 'https://dynamic-media-cdn.tripadvisor.com/large.jpg'
				}
			])
		} satisfies TripadvisorAdapter;
		const service = createPoiEnrichmentService({
			db,
			google: { adapter: google, uiKitKey: 'ui-key' },
			tripadvisor: { adapter: tripadvisor, photosEnabled: true, cacheDays: 30 },
			now: () => Date.parse('2026-08-25T10:00:00.000Z')
		});

		const first = await service.enrich(feature, sourceStyles);
		const second = await service.enrich(feature, sourceStyles);
		const photos = await service.loadTripadvisorPhotos(feature, sourceStyles);
		const repeatedPhotos = await service.loadTripadvisorPhotos(feature, sourceStyles);

		expect(first).toMatchObject({
			google: { status: 'available', placeId: 'ChIJ1234567890_test' },
			tripadvisor: { status: 'available', locationId: '123456', rating: 4.5 }
		});
		expect(second).toEqual(first);
		expect(photos).toMatchObject({ status: 'available', photosLoaded: true });
		expect(repeatedPhotos).toEqual(photos);
		expect(google.searchId).toHaveBeenCalledTimes(1);
		expect(tripadvisor.searchId).toHaveBeenCalledTimes(1);
		expect(tripadvisor.details).toHaveBeenCalledTimes(1);
		expect(tripadvisor.photos).toHaveBeenCalledTimes(1);
		expect(
			(db.prepare('SELECT COUNT(*) AS count FROM poi_enrichment_cache').get() as { count: number })
				.count
		).toBe(1);
	});

	test('re-searches old mappings for numbered destinations', async (): Promise<void> => {
		const destination = structuredClone(feature);
		destination.properties.title = '4 Blue lagoon anchorage';
		destination.properties.layerPath = ['Anker, bøye og marina'];
		destination.properties.style.iconCode = '1623';
		const mappedAt = '2026-08-25T10:00:00.000Z';
		db.prepare(
			`INSERT INTO poi_provider_mappings
			(feature_id, provider, provider_id, source, mapped_at)
			VALUES (?, 'google', 'ChIJ1234567890_old', 'search', ?),
				(?, 'tripadvisor', '111111', 'search', ?)`
		).run(destination.id, mappedAt, destination.id, mappedAt);
		const google = {
			searchId: vi.fn(async () => 'ChIJ1234567890_new'),
			refreshId: vi.fn(async (id: string) => id)
		} satisfies GooglePlacesAdapter;
		const tripadvisor = {
			searchId: vi.fn(async () => '222222'),
			details: vi.fn(async () => ({ locationId: '222222' })),
			photos: vi.fn(async () => [])
		} satisfies TripadvisorAdapter;
		const service = createPoiEnrichmentService({
			db,
			google: { adapter: google, uiKitKey: 'ui-key' },
			tripadvisor: { adapter: tripadvisor, photosEnabled: false, cacheDays: 30 }
		});

		const result = await service.enrich(destination, sourceStyles);

		expect(result).toMatchObject({
			google: { status: 'available', placeId: 'ChIJ1234567890_new' },
			tripadvisor: { status: 'available', locationId: '222222' }
		});
		expect(google.searchId).toHaveBeenCalledOnce();
		expect(tripadvisor.searchId).toHaveBeenCalledOnce();
		expect(
			db
				.prepare('SELECT DISTINCT query_version FROM poi_provider_mappings WHERE feature_id = ?')
				.all(destination.id)
		).toEqual([{ query_version: 3 }]);
	});

	test('retries only photos from a version 1 empty-photo cache entry', async (): Promise<void> => {
		const cachedAt = '2026-08-25T10:00:00.000Z';
		const expiresAt = '2026-09-24T10:00:00.000Z';
		db.prepare(
			`INSERT INTO poi_provider_mappings
			(feature_id, provider, provider_id, source, mapped_at)
			VALUES (?, 'tripadvisor', '123456', 'search', ?)`
		).run(feature.id, cachedAt);
		db.prepare(
			`INSERT INTO poi_enrichment_cache
			(feature_id, provider, schema_version, payload, fetched_at, expires_at)
			VALUES (?, 'tripadvisor', 1, ?, ?, ?)`
		).run(
			feature.id,
			JSON.stringify({
				status: 'available',
				locationId: '123456',
				rating: 4.5,
				reviewCount: 42,
				photos: [],
				photosLoaded: true,
				cachedAt,
				expiresAt
			}),
			cachedAt,
			expiresAt
		);
		const tripadvisor = {
			searchId: vi.fn(async () => 'unused'),
			details: vi.fn(async () => ({ locationId: '123456' })),
			photos: vi.fn(async () => [
				{
					thumbnailUrl: 'https://dynamic-media.tacdn.com/thumb.jpg',
					imageUrl: 'https://dynamic-media.tacdn.com/large.jpg'
				}
			])
		} satisfies TripadvisorAdapter;
		const service = createPoiEnrichmentService({
			db,
			tripadvisor: { adapter: tripadvisor, photosEnabled: true, cacheDays: 30 },
			now: () => Date.parse('2026-08-26T10:00:00.000Z')
		});

		const first = await service.enrich(feature, sourceStyles);
		expect(first.tripadvisor).toMatchObject({
			status: 'available',
			photosLoaded: false,
			photos: []
		});
		const photos = await service.loadTripadvisorPhotos(feature, sourceStyles);

		expect(photos).toMatchObject({ status: 'available', photosLoaded: true });
		expect(photos.status === 'available' ? photos.photos : []).toHaveLength(1);
		expect(tripadvisor.searchId).not.toHaveBeenCalled();
		expect(tripadvisor.details).not.toHaveBeenCalled();
		expect(tripadvisor.photos).toHaveBeenCalledTimes(1);
		expect(
			(
				db
					.prepare(
						"SELECT schema_version FROM poi_enrichment_cache WHERE feature_id = ? AND provider = 'tripadvisor'"
					)
					.get(feature.id) as { schema_version: number }
			).schema_version
		).toBe(3);
	});

	test('collapses concurrent first views into one provider operation', async (): Promise<void> => {
		let release: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tripadvisor = {
			searchId: vi.fn(async () => {
				await pending;
				return '123456';
			}),
			details: vi.fn(async () => ({ locationId: '123456', rating: 4.5 })),
			photos: vi.fn(async () => [])
		} satisfies TripadvisorAdapter;
		const service = createPoiEnrichmentService({
			db,
			tripadvisor: { adapter: tripadvisor, photosEnabled: false, cacheDays: 30 }
		});

		const first = service.enrich(feature, sourceStyles);
		const second = service.enrich(feature, sourceStyles);
		await vi.waitFor(() => expect(tripadvisor.searchId).toHaveBeenCalledTimes(1));
		release?.();
		await Promise.all([first, second]);

		expect(tripadvisor.searchId).toHaveBeenCalledTimes(1);
		expect(tripadvisor.details).toHaveBeenCalledTimes(1);
	});

	test('uses manual overrides without search and replaces cached Tripadvisor content', async (): Promise<void> => {
		const candidate = structuredClone(feature);
		candidate.properties.extendedData.tripadvisor_location_id = '111';
		const tripadvisor = {
			searchId: vi.fn(async () => '999'),
			details: vi.fn(async (id: string) => ({ locationId: id, rating: Number(id) / 100 })),
			photos: vi.fn(async () => [])
		} satisfies TripadvisorAdapter;
		const service = createPoiEnrichmentService({
			db,
			tripadvisor: { adapter: tripadvisor, photosEnabled: false, cacheDays: 30 }
		});

		expect((await service.enrich(candidate, sourceStyles)).tripadvisor).toMatchObject({
			locationId: '111'
		});
		candidate.properties.extendedData.tripadvisor_location_id = '222';
		expect((await service.enrich(candidate, sourceStyles)).tripadvisor).toMatchObject({
			locationId: '222'
		});
		expect(tripadvisor.searchId).not.toHaveBeenCalled();
		expect(tripadvisor.details).toHaveBeenCalledTimes(2);
	});
});
