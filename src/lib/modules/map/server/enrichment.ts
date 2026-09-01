import type Database from 'better-sqlite3';

import {
	type GoogleEnrichment,
	googlePlaceIdOverride,
	type PoiEnrichmentResponse,
	providerSearchTitle,
	type TripadvisorAvailableEnrichment,
	type TripadvisorEnrichment,
	tripadvisorEnrichmentSchema,
	tripadvisorLocationIdOverride
} from '$lib/modules/map/domain/enrichment';
import type { MapFeature, MapSourceStyleLegend } from '$lib/modules/map/domain/types';

import type { GooglePlacesAdapter } from './google-places';
import { ProviderError } from './provider-http';
import type { TripadvisorAdapter } from './tripadvisor';

type Provider = 'google' | 'tripadvisor';
type MappingSource = 'kml' | 'search';
type MappingRow = {
	provider_id: string | null;
	source: MappingSource | null;
	mapped_at: string | null;
	retry_reason: 'no_match' | 'rate_limited' | null;
	retry_after: string | null;
	query_version: number;
};
type CacheRow = { payload: string; expires_at: string; schema_version: number };

const tripadvisorCacheSchemaVersion = 3;
const providerQueryVersion = 3;

export type PoiEnrichmentServiceDependencies = {
	db: Database.Database;
	tripId: string;
	google?: { adapter: GooglePlacesAdapter; browserApiKey: string };
	tripadvisor?: {
		adapter: TripadvisorAdapter;
		photosEnabled: boolean;
		cacheDays: number;
	};
	now?: () => number;
};

export type PoiEnrichmentService = {
	enrich: (
		feature: MapFeature,
		sourceStyles: readonly MapSourceStyleLegend[]
	) => Promise<PoiEnrichmentResponse>;
	loadTripadvisorPhotos: (
		feature: MapFeature,
		sourceStyles: readonly MapSourceStyleLegend[]
	) => Promise<TripadvisorEnrichment>;
};

export function createPoiEnrichmentService(
	dependencies: PoiEnrichmentServiceDependencies
): PoiEnrichmentService {
	const now = dependencies.now ?? Date.now;
	const inFlight = new Map<string, Promise<unknown>>();

	function withFlight<T>(key: string, operation: () => Promise<T>): Promise<T> {
		const existing = inFlight.get(key) as Promise<T> | undefined;
		if (existing) return existing;
		const promise = operation().finally(() => inFlight.delete(key));
		inFlight.set(key, promise);
		return promise;
	}

	function mapping(featureId: string, provider: Provider): MappingRow | undefined {
		return dependencies.db
			.prepare(
				`SELECT provider_id, source, mapped_at, retry_reason, retry_after, query_version
				 FROM trip_poi_provider_mappings
				 WHERE trip_id = ? AND feature_id = ? AND provider = ?`
			)
			.get(dependencies.tripId, featureId, provider) as MappingRow | undefined;
	}

	function deleteMapping(featureId: string, provider: Provider): void {
		dependencies.db
			.prepare(
				'DELETE FROM trip_poi_provider_mappings WHERE trip_id = ? AND feature_id = ? AND provider = ?'
			)
			.run(dependencies.tripId, featureId, provider);
	}

	function deleteCache(featureId: string): void {
		dependencies.db
			.prepare(
				"DELETE FROM trip_poi_enrichment_cache WHERE trip_id = ? AND feature_id = ? AND provider = 'tripadvisor'"
			)
			.run(dependencies.tripId, featureId);
	}

	function storeMapping(
		featureId: string,
		provider: Provider,
		providerId: string,
		source: MappingSource
	): void {
		dependencies.db
			.prepare(
				`INSERT INTO trip_poi_provider_mappings
					(trip_id, feature_id, provider, provider_id, source, mapped_at,
					 retry_reason, retry_after, query_version)
				 VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
				 ON CONFLICT(trip_id, feature_id, provider) DO UPDATE SET
					provider_id = excluded.provider_id,
					source = excluded.source,
					mapped_at = excluded.mapped_at,
					retry_reason = NULL,
					retry_after = NULL,
					query_version = excluded.query_version`
			)
			.run(
				dependencies.tripId,
				featureId,
				provider,
				providerId,
				source,
				new Date(now()).toISOString(),
				providerQueryVersion
			);
	}

	function storeFailure(featureId: string, provider: Provider, error: ProviderError): void {
		if (error.code !== 'no_match' && error.code !== 'rate_limited') return;
		const retryAt =
			error.retryAfter ??
			new Date(
				now() +
					(error.code === 'no_match'
						? (dependencies.tripadvisor?.cacheDays ?? 30) * 86_400_000
						: 60_000)
			);
		dependencies.db
			.prepare(
				`INSERT INTO trip_poi_provider_mappings
					(trip_id, feature_id, provider, provider_id, source, mapped_at,
					 retry_reason, retry_after, query_version)
				 VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
				 ON CONFLICT(trip_id, feature_id, provider) DO UPDATE SET
					provider_id = NULL,
					source = NULL,
					mapped_at = NULL,
					retry_reason = excluded.retry_reason,
					retry_after = excluded.retry_after,
					query_version = excluded.query_version`
			)
			.run(
				dependencies.tripId,
				featureId,
				provider,
				error.code,
				retryAt.toISOString(),
				providerQueryVersion
			);
	}

	function activeFailure(
		row: MappingRow | undefined
	): GoogleEnrichment | TripadvisorEnrichment | undefined {
		if (!row?.retry_reason || !row.retry_after) return undefined;
		if (Date.parse(row.retry_after) <= now()) return undefined;
		return row.retry_reason === 'no_match' ? { status: 'no_match' } : { status: 'unavailable' };
	}

	function resolveStoredId(
		feature: MapFeature,
		provider: Provider,
		override: string | undefined
	): { id?: string; source?: MappingSource; mappedAt?: string; failure?: MappingRow } {
		let row = mapping(feature.id, provider);
		if (
			row?.query_version !== providerQueryVersion &&
			row?.source !== 'kml' &&
			providerSearchTitle(feature) !== feature.properties.title
		) {
			deleteMapping(feature.id, provider);
			if (provider === 'tripadvisor') deleteCache(feature.id);
			row = undefined;
		}
		if (override) {
			if (row?.provider_id !== override || row.source !== 'kml') {
				storeMapping(feature.id, provider, override, 'kml');
				if (provider === 'tripadvisor') deleteCache(feature.id);
			}
			return { id: override, source: 'kml', mappedAt: new Date(now()).toISOString() };
		}
		if (row?.source === 'kml') {
			deleteMapping(feature.id, provider);
			if (provider === 'tripadvisor') deleteCache(feature.id);
			return {};
		}
		if (row?.provider_id && row.source && row.mapped_at) {
			return { id: row.provider_id, source: row.source, mappedAt: row.mapped_at };
		}
		if (row?.retry_reason) return { failure: row };
		return {};
	}

	async function google(feature: MapFeature): Promise<GoogleEnrichment> {
		const configured = dependencies.google;
		if (!configured) return { status: 'disabled' };
		return withFlight(`${feature.id}:google`, async () => {
			let stored = resolveStoredId(feature, 'google', googlePlaceIdOverride(feature));
			const failure = activeFailure(stored.failure);
			if (failure) return failure as GoogleEnrichment;
			try {
				if (
					stored.id &&
					stored.mappedAt &&
					now() - Date.parse(stored.mappedAt) >= 365 * 86_400_000
				) {
					try {
						const refreshed = await configured.adapter.refreshId(stored.id);
						storeMapping(feature.id, 'google', refreshed, stored.source ?? 'search');
						stored = { ...stored, id: refreshed };
					} catch (error) {
						if (!(error instanceof ProviderError) || error.code !== 'not_found') throw error;
						if (stored.source === 'kml') throw new ProviderError('no_match');
						deleteMapping(feature.id, 'google');
						stored = {};
					}
				}
				const placeId = stored.id ?? (await configured.adapter.searchId(feature));
				if (!stored.id) storeMapping(feature.id, 'google', placeId, 'search');
				return { status: 'available', placeId, browserApiKey: configured.browserApiKey };
			} catch (error) {
				if (error instanceof ProviderError) {
					storeFailure(feature.id, 'google', error);
					return error.code === 'no_match' || error.code === 'not_found'
						? { status: 'no_match' }
						: { status: 'unavailable' };
				}
				return { status: 'unavailable' };
			}
		});
	}

	function cachedTripadvisor(featureId: string): TripadvisorAvailableEnrichment | undefined {
		const row = dependencies.db
			.prepare(
				"SELECT payload, expires_at, schema_version FROM trip_poi_enrichment_cache WHERE trip_id = ? AND feature_id = ? AND provider = 'tripadvisor'"
			)
			.get(dependencies.tripId, featureId) as CacheRow | undefined;
		if (!row) return undefined;
		if (Date.parse(row.expires_at) <= now()) {
			deleteCache(featureId);
			return undefined;
		}
		try {
			const parsed = tripadvisorEnrichmentSchema.parse(JSON.parse(row.payload));
			if (parsed.status !== 'available') throw new Error('INVALID_TRIPADVISOR_CACHE');
			if (row.schema_version !== tripadvisorCacheSchemaVersion) {
				throw new Error('UNSUPPORTED_TRIPADVISOR_CACHE');
			}
			return parsed;
		} catch {
			deleteCache(featureId);
			return undefined;
		}
	}

	function cacheTripadvisor(featureId: string, value: TripadvisorAvailableEnrichment): void {
		dependencies.db
			.prepare(
				`INSERT INTO trip_poi_enrichment_cache
					(trip_id, feature_id, provider, schema_version, payload, fetched_at, expires_at)
					 VALUES (?, ?, 'tripadvisor', ?, ?, ?, ?)
				 ON CONFLICT(trip_id, feature_id, provider) DO UPDATE SET
					schema_version = excluded.schema_version,
					payload = excluded.payload,
					fetched_at = excluded.fetched_at,
					expires_at = excluded.expires_at`
			)
			.run(
				dependencies.tripId,
				featureId,
				tripadvisorCacheSchemaVersion,
				JSON.stringify(value),
				value.cachedAt,
				value.expiresAt
			);
	}

	async function tripadvisor(
		feature: MapFeature,
		sourceStyles: readonly MapSourceStyleLegend[]
	): Promise<TripadvisorEnrichment> {
		const configured = dependencies.tripadvisor;
		if (!configured) return { status: 'disabled' };
		const stored = resolveStoredId(feature, 'tripadvisor', tripadvisorLocationIdOverride(feature));
		const failure = activeFailure(stored.failure);
		if (failure) return failure as TripadvisorEnrichment;
		const cached = cachedTripadvisor(feature.id);
		if (cached) return cached;
		return withFlight(`${feature.id}:tripadvisor`, async () => {
			const repeatedCache = cachedTripadvisor(feature.id);
			if (repeatedCache) return repeatedCache;
			try {
				const locationId = stored.id ?? (await configured.adapter.searchId(feature, sourceStyles));
				if (!stored.id) storeMapping(feature.id, 'tripadvisor', locationId, 'search');
				const details = await configured.adapter.details(locationId);
				const cachedAt = new Date(now()).toISOString();
				const value: TripadvisorAvailableEnrichment = {
					status: 'available',
					locationId: details.locationId,
					...(details.rating !== undefined ? { rating: details.rating } : {}),
					...(details.reviewCount !== undefined ? { reviewCount: details.reviewCount } : {}),
					...(details.ratingImageUrl ? { ratingImageUrl: details.ratingImageUrl } : {}),
					...(details.webUrl ? { webUrl: details.webUrl } : {}),
					...(details.photosUrl ? { photosUrl: details.photosUrl } : {}),
					photos: [],
					photosLoaded: !configured.photosEnabled,
					cachedAt,
					expiresAt: new Date(now() + configured.cacheDays * 86_400_000).toISOString()
				};
				cacheTripadvisor(feature.id, value);
				return value;
			} catch (error) {
				if (error instanceof ProviderError) {
					storeFailure(feature.id, 'tripadvisor', error);
					return error.code === 'no_match' || error.code === 'not_found'
						? { status: 'no_match' }
						: { status: 'unavailable' };
				}
				return { status: 'unavailable' };
			}
		});
	}

	async function enrich(
		feature: MapFeature,
		sourceStyles: readonly MapSourceStyleLegend[]
	): Promise<PoiEnrichmentResponse> {
		const [googleResult, tripadvisorResult] = await Promise.all([
			google(feature),
			tripadvisor(feature, sourceStyles)
		]);
		return { featureId: feature.id, google: googleResult, tripadvisor: tripadvisorResult };
	}

	async function loadTripadvisorPhotos(
		feature: MapFeature,
		sourceStyles: readonly MapSourceStyleLegend[]
	): Promise<TripadvisorEnrichment> {
		const configured = dependencies.tripadvisor;
		if (!configured) return { status: 'disabled' };
		const current = await tripadvisor(feature, sourceStyles);
		if (current.status !== 'available' || current.photosLoaded || !configured.photosEnabled) {
			return current;
		}
		return withFlight(`${feature.id}:tripadvisor:photos`, async () => {
			const repeated = cachedTripadvisor(feature.id);
			if (repeated?.photosLoaded) return repeated;
			try {
				const base = repeated ?? current;
				const photos = await configured.adapter.photos(
					base.locationId,
					base.photosUrl ?? base.webUrl
				);
				const cachedAt = new Date(now()).toISOString();
				const value: TripadvisorAvailableEnrichment = {
					...base,
					photos,
					photosLoaded: true,
					cachedAt,
					expiresAt: new Date(now() + configured.cacheDays * 86_400_000).toISOString()
				};
				cacheTripadvisor(feature.id, value);
				return value;
			} catch {
				return current;
			}
		});
	}

	return { enrich, loadTripadvisorPhotos };
}
