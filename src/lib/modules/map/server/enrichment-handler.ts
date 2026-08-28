import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import { getDatabase } from '$lib/app/server/database';
import { isPoiEnrichmentEligible } from '$lib/modules/map/domain/enrichment';
import {
	type OpenFreeMapRestaurant,
	openFreeMapRestaurantFeature,
	openFreeMapRestaurantSchema,
	openFreeMapRestaurantSourceStyle
} from '$lib/modules/map/domain/openfreemap';
import { apiError, parseJsonRequest } from '$lib/server/api';

import { getMapRuntimeConfig, type MapRuntimeConfig } from './config';
import { createPoiEnrichmentService, type PoiEnrichmentService } from './enrichment';
import { createGooglePlacesAdapter } from './google-places';
import { getCurrentMapSnapshot } from './service';
import { createTripadvisorAdapter } from './tripadvisor';

const configuredServices = new WeakMap<Database.Database, Map<string, PoiEnrichmentService>>();

function service(
	db: Database.Database,
	tripId: string,
	config: MapRuntimeConfig
): PoiEnrichmentService {
	let services = configuredServices.get(db);
	if (!services) {
		services = new Map();
		configuredServices.set(db, services);
	}
	let configuredService = services.get(tripId);
	if (!configuredService) {
		configuredService = createPoiEnrichmentService({
			db,
			tripId,
			...(config.googlePlacesServerApiKey && config.googlePlacesUiKitApiKey
				? {
						google: {
							adapter: createGooglePlacesAdapter(config.googlePlacesServerApiKey),
							uiKitKey: config.googlePlacesUiKitApiKey
						}
					}
				: {}),
			...(config.tripadvisorTerraApiKey
				? {
						tripadvisor: {
							adapter: createTripadvisorAdapter(config.tripadvisorTerraApiKey),
							photosEnabled: config.tripadvisorTerraPhotosEnabled,
							cacheDays: config.tripadvisorCacheDays
						}
					}
				: {})
		});
		services.set(tripId, configuredService);
	}
	return configuredService;
}

async function trustedFeature(
	tripId: string,
	featureId: string,
	db: Database.Database,
	config: MapRuntimeConfig
): Promise<{
	feature: Awaited<ReturnType<typeof getCurrentMapSnapshot>>['features'][number];
	sourceStyles: Awaited<ReturnType<typeof getCurrentMapSnapshot>>['sourceStyles'];
}> {
	const snapshot = await getCurrentMapSnapshot(tripId, db, config);
	const feature = snapshot.features.find((candidate) => candidate.id === featureId);
	if (!feature) throw new Error('POI_NOT_FOUND');
	if (!isPoiEnrichmentEligible(feature)) throw new Error('POI_NOT_ELIGIBLE');
	return { feature, sourceStyles: snapshot.sourceStyles };
}

function enrichmentError(error: unknown): Response {
	if (error instanceof Error && error.message === 'INVALID_REQUEST') {
		return apiError('INVALID_REQUEST', 400);
	}
	if (error instanceof Error && error.message === 'POI_NOT_FOUND') {
		return apiError('POI_NOT_FOUND', 404);
	}
	if (error instanceof Error && error.message === 'POI_NOT_ELIGIBLE') {
		return apiError('POI_NOT_ELIGIBLE', 422);
	}
	return apiError('POI_ENRICHMENT_UNAVAILABLE', 503);
}

export function openFreeMapRestaurantFeatureId(restaurant: OpenFreeMapRestaurant): string {
	const canonical = [
		restaurant.source,
		restaurant.category,
		restaurant.title.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim(),
		restaurant.longitude.toFixed(4),
		restaurant.latitude.toFixed(4)
	].join('|');
	return `openfreemap:${createHash('sha256').update(canonical).digest('hex')}`;
}

async function requestedOpenFreeMapRestaurant(request: Request): Promise<{
	feature: ReturnType<typeof openFreeMapRestaurantFeature>;
	sourceStyles: [typeof openFreeMapRestaurantSourceStyle];
}> {
	const result = await parseJsonRequest(request, openFreeMapRestaurantSchema);
	if (!result.success) throw new Error('INVALID_REQUEST');
	return {
		feature: openFreeMapRestaurantFeature(result.data, openFreeMapRestaurantFeatureId(result.data)),
		sourceStyles: [openFreeMapRestaurantSourceStyle]
	};
}

export async function handleGetPoiEnrichment(
	tripId: string,
	featureId: string,
	db: Database.Database = getDatabase(),
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<Response> {
	try {
		const { feature, sourceStyles } = await trustedFeature(tripId, featureId, db, config);
		return Response.json(await service(db, tripId, config).enrich(feature, sourceStyles), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return enrichmentError(error);
	}
}

export async function handleGetPoiEnrichmentPhotos(
	tripId: string,
	featureId: string,
	db: Database.Database = getDatabase(),
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<Response> {
	try {
		const { feature, sourceStyles } = await trustedFeature(tripId, featureId, db, config);
		return Response.json(
			{
				featureId,
				tripadvisor: await service(db, tripId, config).loadTripadvisorPhotos(feature, sourceStyles)
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		return enrichmentError(error);
	}
}

export async function handleOpenFreeMapPoiEnrichment(
	tripId: string,
	request: Request,
	db: Database.Database = getDatabase(),
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<Response> {
	try {
		const { feature, sourceStyles } = await requestedOpenFreeMapRestaurant(request);
		return Response.json(await service(db, tripId, config).enrich(feature, sourceStyles), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return enrichmentError(error);
	}
}

export async function handleOpenFreeMapPoiEnrichmentPhotos(
	tripId: string,
	request: Request,
	db: Database.Database = getDatabase(),
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<Response> {
	try {
		const { feature, sourceStyles } = await requestedOpenFreeMapRestaurant(request);
		return Response.json(
			{
				featureId: feature.id,
				tripadvisor: await service(db, tripId, config).loadTripadvisorPhotos(feature, sourceStyles)
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		return enrichmentError(error);
	}
}
