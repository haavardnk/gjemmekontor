import { z } from 'zod';

import { getRuntimeConfig } from '$lib/server/env';

const optionalString = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().min(1).optional()
);

const mapEnvironmentSchema = z.object({
	AISSTREAM_API_KEY: z.string().min(1),
	BUNDLED_OFFLINE_MAP_DIR: optionalString,
	GOOGLE_MY_MAPS_ID: z.string().min(1),
	GOOGLE_PLACES_SERVER_API_KEY: optionalString,
	GOOGLE_PLACES_UI_KIT_API_KEY: optionalString,
	TRIPADVISOR_TERRA_API_KEY: optionalString,
	TRIPADVISOR_TERRA_PHOTOS_ENABLED: z.enum(['true', 'false']).optional(),
	TRIPADVISOR_CACHE_DAYS: z.coerce.number().int().min(1).max(365).optional()
});

export type MapRuntimeConfig = {
	aisStreamApiKey: string;
	dataDir: string;
	bundledOfflineMapDir?: string;
	googleMyMapsId: string;
	googlePlacesServerApiKey?: string;
	googlePlacesUiKitApiKey?: string;
	tripadvisorTerraApiKey?: string;
	tripadvisorTerraPhotosEnabled: boolean;
	tripadvisorCacheDays: number;
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
		aisStreamApiKey: result.data.AISSTREAM_API_KEY,
		dataDir,
		googleMyMapsId: result.data.GOOGLE_MY_MAPS_ID,
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

export function getMapRuntimeConfig(): MapRuntimeConfig {
	return parseMapRuntimeConfig(process.env, getRuntimeConfig().dataDir);
}
