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
		address: 'Testbyen, Testland',
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
const tripId = '28ba216a-693e-4eb2-89fd-091fbd16cf21';

beforeEach((): void => {
	directory = mkdtempSync(join(tmpdir(), 'gjemmekontor-enrichment-'));
	db = createApplicationDatabase(directory);
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, 'test-trip', 'Test trip', 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	).run(tripId, '2026-08-27', '2026-08-27');
});

afterEach((): void => {
	db.close();
	rmSync(directory, { recursive: true, force: true });
});

describe('POI enrichment orchestration', (): void => {
	test('keeps both providers independently disabled without configuration', async (): Promise<void> => {
		const service = createPoiEnrichmentService({ db, tripId });
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
			tripId,
			google: { adapter: google, browserApiKey: 'browser-key' },
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
			(
				db
					.prepare('SELECT COUNT(*) AS count FROM trip_poi_enrichment_cache WHERE trip_id = ?')
					.get(tripId) as { count: number }
			).count
		).toBe(1);
	});

	test('isolates identical feature identities between trips', async (): Promise<void> => {
		const secondTripId = '23529b55-937b-4fff-850b-44de6730b395';
		db.prepare(
			`INSERT INTO trips
			 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
			 VALUES (?, 'second-trip', 'Second trip', 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
		).run(secondTripId, '2026-08-27', '2026-08-27');
		const google = {
			searchId: vi
				.fn<GooglePlacesAdapter['searchId']>()
				.mockResolvedValueOnce('place-for-first-trip')
				.mockResolvedValueOnce('place-for-second-trip'),
			refreshId: vi.fn(async (id: string) => id)
		} satisfies GooglePlacesAdapter;
		const first = createPoiEnrichmentService({
			db,
			tripId,
			google: { adapter: google, browserApiKey: 'browser-key' }
		});
		const second = createPoiEnrichmentService({
			db,
			tripId: secondTripId,
			google: { adapter: google, browserApiKey: 'browser-key' }
		});

		expect((await first.enrich(feature, sourceStyles)).google).toMatchObject({
			placeId: 'place-for-first-trip'
		});
		expect((await second.enrich(feature, sourceStyles)).google).toMatchObject({
			placeId: 'place-for-second-trip'
		});
		expect(
			db
				.prepare(
					`SELECT trip_id, provider_id FROM trip_poi_provider_mappings
					 WHERE feature_id = ? ORDER BY trip_id`
				)
				.all(feature.id)
		).toEqual([
			{ trip_id: secondTripId, provider_id: 'place-for-second-trip' },
			{ trip_id: tripId, provider_id: 'place-for-first-trip' }
		]);
	});

	test('re-searches old mappings for numbered destinations', async (): Promise<void> => {
		const destination = structuredClone(feature);
		destination.properties.title = '4 Testbukta';
		destination.properties.layerPath = ['Anker, bøye og marina'];
		destination.properties.style.iconCode = '1623';
		const mappedAt = '2026-08-25T10:00:00.000Z';
		db.prepare(
			`INSERT INTO trip_poi_provider_mappings
			(trip_id, feature_id, provider, provider_id, source, mapped_at)
			VALUES (?, ?, 'google', 'ChIJ1234567890_old', 'search', ?),
				(?, ?, 'tripadvisor', '111111', 'search', ?)`
		).run(tripId, destination.id, mappedAt, tripId, destination.id, mappedAt);
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
			tripId,
			google: { adapter: google, browserApiKey: 'browser-key' },
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
				.prepare(
					'SELECT DISTINCT query_version FROM trip_poi_provider_mappings WHERE trip_id = ? AND feature_id = ?'
				)
				.all(tripId, destination.id)
		).toEqual([{ query_version: 3 }]);
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
			tripId,
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
			tripId,
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
