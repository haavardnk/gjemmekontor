import type Database from 'better-sqlite3';
import { z } from 'zod';

import type { MapMode } from '$lib/modules/map/domain/types';
import { getRuntimeConfig } from '$lib/server/env';

const optionalString = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().min(1).optional()
);

const mapEnvironmentSchema = z.object({
	AISSTREAM_API_KEY: optionalString,
	BUNDLED_OFFLINE_MAP_DIR: optionalString,
	GOOGLE_PLACES_SERVER_API_KEY: optionalString,
	GOOGLE_PLACES_UI_KIT_API_KEY: optionalString,
	TRIPADVISOR_TERRA_API_KEY: optionalString,
	TRIPADVISOR_TERRA_PHOTOS_ENABLED: z.enum(['true', 'false']).optional(),
	TRIPADVISOR_CACHE_DAYS: z.coerce.number().int().min(1).max(365).optional()
});

export type MapRuntimeConfig = {
	aisStreamApiKey?: string;
	dataDir: string;
	bundledOfflineMapDir?: string;
	googlePlacesServerApiKey?: string;
	googlePlacesUiKitApiKey?: string;
	tripadvisorTerraApiKey?: string;
	tripadvisorTerraPhotosEnabled: boolean;
	tripadvisorCacheDays: number;
};

export const mapOverlayValues = ['ais', 'depth-contours'] as const;
export type MapOverlay = (typeof mapOverlayValues)[number];
const mapModeSchema = z.enum(['normal', 'nautical', 'satellite']);

const tripMapConfigSchema = z
	.object({
		googleMyMapsId: z.string().trim().min(1).max(500),
		defaultMode: mapModeSchema.default('normal'),
		enabledOverlays: z.array(z.enum(mapOverlayValues)).default([...mapOverlayValues]),
		offlinePackages: z.array(mapModeSchema).default([])
	})
	.strict()
	.refine((value) => new Set(value.enabledOverlays).size === value.enabledOverlays.length)
	.refine((value) => new Set(value.offlinePackages).size === value.offlinePackages.length);

export type TripMapConfig = {
	googleMyMapsId: string;
	defaultMode: MapMode;
	enabledOverlays: MapOverlay[];
	offlinePackages: MapMode[];
	configVersion: number;
};

export function parseMapRuntimeConfig(
	environment: Record<string, string | undefined>,
	dataDir: string
): MapRuntimeConfig {
	const result = mapEnvironmentSchema.safeParse(environment);
	if (!result.success) {
		const variables = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
		throw new Error(`Invalid Map environment: ${variables.join(', ')}`);
	}
	return {
		dataDir,
		...(result.data.AISSTREAM_API_KEY ? { aisStreamApiKey: result.data.AISSTREAM_API_KEY } : {}),
		...(result.data.GOOGLE_PLACES_SERVER_API_KEY
			? { googlePlacesServerApiKey: result.data.GOOGLE_PLACES_SERVER_API_KEY }
			: {}),
		...(result.data.GOOGLE_PLACES_UI_KIT_API_KEY
			? { googlePlacesUiKitApiKey: result.data.GOOGLE_PLACES_UI_KIT_API_KEY }
			: {}),
		...(result.data.TRIPADVISOR_TERRA_API_KEY
			? { tripadvisorTerraApiKey: result.data.TRIPADVISOR_TERRA_API_KEY }
			: {}),
		tripadvisorTerraPhotosEnabled: result.data.TRIPADVISOR_TERRA_PHOTOS_ENABLED === 'true',
		tripadvisorCacheDays: result.data.TRIPADVISOR_CACHE_DAYS ?? 30,
		...(result.data.BUNDLED_OFFLINE_MAP_DIR
			? { bundledOfflineMapDir: result.data.BUNDLED_OFFLINE_MAP_DIR }
			: {})
	};
}

export function loadTripMapConfig(db: Database.Database, tripId: string): TripMapConfig {
	const row = db
		.prepare(
			`SELECT config_json, config_version FROM trip_modules
			 WHERE trip_id = ? AND module_id = 'map' AND enabled = 1`
		)
		.get(tripId) as { config_json: string; config_version: number } | undefined;
	if (!row) throw new Error('MAP_NOT_CONFIGURED');
	const parsed = tripMapConfigSchema.safeParse(JSON.parse(row.config_json));
	if (!parsed.success) throw new Error('MAP_NOT_CONFIGURED');
	return { ...parsed.data, configVersion: row.config_version };
}

export function getMapRuntimeConfig(): MapRuntimeConfig {
	return parseMapRuntimeConfig(process.env, getRuntimeConfig().dataDir);
}
