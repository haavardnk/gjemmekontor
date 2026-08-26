import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';
import type { OpenFreeMapRestaurant } from '$lib/modules/map/domain/openfreemap';

import type { MapRuntimeConfig } from './config';
import {
	handleOpenFreeMapPoiEnrichment,
	handleOpenFreeMapPoiEnrichmentPhotos,
	openFreeMapRestaurantFeatureId
} from './enrichment-handler';

const restaurant: OpenFreeMapRestaurant = {
	source: 'openfreemap',
	title: 'Konoba Test',
	longitude: 16.4402,
	latitude: 43.5081,
	category: 'restaurant'
};
const config: MapRuntimeConfig = {
	aisStreamApiKey: 'ais-key',
	dataDir: '/tmp',
	googleMyMapsId: 'map-id',
	tripadvisorTerraPhotosEnabled: false,
	tripadvisorCacheDays: 30
};

let directory = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	directory = mkdtempSync(join(tmpdir(), 'gjemmekontor-openfreemap-enrichment-'));
	db = createApplicationDatabase(directory);
});

afterEach((): void => {
	db.close();
	rmSync(directory, { recursive: true, force: true });
});

function request(body: unknown): Request {
	return new Request('http://localhost/api/map/poi/openfreemap/enrichment', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('OpenFreeMap enrichment handler', (): void => {
	test('creates a stable cache identity tolerant of vector-tile coordinate precision', (): void => {
		expect(openFreeMapRestaurantFeatureId(restaurant)).toBe(
			openFreeMapRestaurantFeatureId({ ...restaurant, longitude: 16.44021, latitude: 43.50809 })
		);
		expect(openFreeMapRestaurantFeatureId({ ...restaurant, title: 'Another place' })).not.toBe(
			openFreeMapRestaurantFeatureId(restaurant)
		);
	});

	test('accepts a restaurant and returns the shared provider response shape', async (): Promise<void> => {
		const response = await handleOpenFreeMapPoiEnrichment(request(restaurant), db, config);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			featureId: expect.stringMatching(/^openfreemap:[a-f0-9]{64}$/),
			google: { status: 'disabled' },
			tripadvisor: { status: 'disabled' }
		});
	});

	test('uses the same stable feature identity for Tripadvisor photos', async (): Promise<void> => {
		const response = await handleOpenFreeMapPoiEnrichmentPhotos(request(restaurant), db, config);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			featureId: openFreeMapRestaurantFeatureId(restaurant),
			tripadvisor: { status: 'disabled' }
		});
	});

	test.each([
		{ ...restaurant, category: 'cafe' },
		{ ...restaurant, title: '' },
		{ ...restaurant, longitude: 181 },
		{ ...restaurant, unexpected: true }
	])('rejects untrusted or malformed payloads', async (body): Promise<void> => {
		const response = await handleOpenFreeMapPoiEnrichment(request(body), db, config);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'INVALID_REQUEST' });
	});
});
