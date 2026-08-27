import type Database from 'better-sqlite3';

import { getDatabase } from '$lib/app/server/database';
import type { MapSnapshot } from '$lib/modules/map/domain/types';
import { apiError, apiSuccess } from '$lib/server/api';

import {
	getMapRuntimeConfig,
	loadTripMapConfig,
	type MapRuntimeConfig,
	type TripMapConfig
} from './config';
import { createMapService, mapCachePaths, MapServiceError } from './google';

type MapService = ReturnType<typeof createMapService>;

const configuredServices = new WeakMap<
	Database.Database,
	Map<string, { service: MapService; mapId: string }>
>();

function getConfiguredService(
	db: Database.Database,
	tripId: string,
	runtime: MapRuntimeConfig,
	tripConfig: TripMapConfig
): { service: MapService; mapId: string } {
	let services = configuredServices.get(db);
	if (!services) {
		services = new Map();
		configuredServices.set(db, services);
	}
	const key = `${tripId}:${tripConfig.configVersion}:${tripConfig.googleMyMapsId}`;
	let configured = services.get(key);
	if (!configured) {
		configured = {
			service: createMapService({
				mapId: tripConfig.googleMyMapsId,
				paths: mapCachePaths(runtime.dataDir, tripId)
			}),
			mapId: tripConfig.googleMyMapsId
		};
		services.set(key, configured);
	}
	return configured;
}

async function response(
	tripId: string,
	operation: (service: MapService) => ReturnType<MapService['get']>,
	db: Database.Database = getDatabase(),
	runtime: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<Response> {
	try {
		const configured = getConfiguredService(db, tripId, runtime, loadTripMapConfig(db, tripId));
		return apiSuccess({
			...(await operation(configured.service)),
			sourceMapId: configured.mapId
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'MAP_NOT_CONFIGURED') {
			return apiError('MAP_NOT_CONFIGURED', 409);
		}
		if (error instanceof MapServiceError) {
			return apiError(error.code, error.status);
		}
		return apiError('MAP_UNAVAILABLE', 502);
	}
}

export function handleGetMap(
	tripId: string,
	db?: Database.Database,
	runtime?: MapRuntimeConfig
): Promise<Response> {
	return response(tripId, (service) => service.get(), db, runtime);
}

export function handleRefreshMap(
	tripId: string,
	db?: Database.Database,
	runtime?: MapRuntimeConfig
): Promise<Response> {
	return response(tripId, (service) => service.refresh(), db, runtime);
}

export async function getCurrentMapSnapshot(
	tripId: string,
	db: Database.Database = getDatabase(),
	runtime: MapRuntimeConfig = getMapRuntimeConfig()
): Promise<MapSnapshot> {
	return (
		await getConfiguredService(db, tripId, runtime, loadTripMapConfig(db, tripId)).service.get()
	).snapshot;
}
