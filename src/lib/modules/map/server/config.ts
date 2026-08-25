import { z } from 'zod';

import { getRuntimeConfig } from '$lib/server/env';

const mapEnvironmentSchema = z.object({
	BUNDLED_OFFLINE_MAP_DIR: z.string().min(1).optional(),
	GOOGLE_MY_MAPS_ID: z.string().min(1)
});

export type MapRuntimeConfig = {
	dataDir: string;
	bundledOfflineMapDir?: string;
	googleMyMapsId: string;
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
		googleMyMapsId: result.data.GOOGLE_MY_MAPS_ID,
		...(result.data.BUNDLED_OFFLINE_MAP_DIR
			? { bundledOfflineMapDir: result.data.BUNDLED_OFFLINE_MAP_DIR }
			: {})
	};
}

export function getMapRuntimeConfig(): MapRuntimeConfig {
	return parseMapRuntimeConfig(process.env, getRuntimeConfig().dataDir);
}
