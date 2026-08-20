import { apiError, apiSuccess } from '$lib/server/api';
import { getRuntimeConfig } from '$lib/server/env';

import { createMapService, mapCachePaths, MapServiceError } from './google';

const config = getRuntimeConfig();
const service = createMapService({
	mapId: config.googleMyMapsId,
	paths: mapCachePaths(config.dataDir)
});

async function response(operation: () => ReturnType<typeof service.get>): Promise<Response> {
	try {
		return apiSuccess({
			...(await operation()),
			sourceMapId: config.googleMyMapsId
		});
	} catch (error) {
		if (error instanceof MapServiceError) {
			return apiError(error.code, error.status);
		}
		return apiError('MAP_UNAVAILABLE', 502);
	}
}

export function handleGetMap(): Promise<Response> {
	return response(service.get);
}

export function handleRefreshMap(): Promise<Response> {
	return response(service.refresh);
}
