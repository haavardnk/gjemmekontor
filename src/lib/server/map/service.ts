import { apiError, apiSuccess } from '$lib/server/api';
import { getRuntimeConfig } from '$lib/server/env';

import { createMapService, mapCachePaths, MapServiceError } from './google';

type MapService = ReturnType<typeof createMapService>;

let configuredService: { service: MapService; mapId: string } | undefined;

function getConfiguredService(): { service: MapService; mapId: string } {
	if (!configuredService) {
		const config = getRuntimeConfig();
		configuredService = {
			service: createMapService({
				mapId: config.googleMyMapsId,
				paths: mapCachePaths(config.dataDir)
			}),
			mapId: config.googleMyMapsId
		};
	}
	return configuredService;
}

async function response(
	operation: (service: MapService) => ReturnType<MapService['get']>
): Promise<Response> {
	try {
		const configured = getConfiguredService();
		return apiSuccess({
			...(await operation(configured.service)),
			sourceMapId: configured.mapId
		});
	} catch (error) {
		if (error instanceof MapServiceError) {
			return apiError(error.code, error.status);
		}
		return apiError('MAP_UNAVAILABLE', 502);
	}
}

export function handleGetMap(): Promise<Response> {
	return response((service) => service.get());
}

export function handleRefreshMap(): Promise<Response> {
	return response((service) => service.refresh());
}
