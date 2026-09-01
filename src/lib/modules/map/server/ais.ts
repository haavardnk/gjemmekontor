import { join } from 'node:path';

import type Database from 'better-sqlite3';
import WebSocket, { type RawData } from 'ws';

import type { AisApiResponse, AisConnectionStatus } from '$lib/modules/map/domain/ais';
import type { MapBounds } from '$lib/modules/map/domain/types';
import { apiError, apiSuccess } from '$lib/server/api';

import { loadVesselCache, persistVesselCache } from './ais-cache';
import { aisMessageTypes, applyAisMessage, asRecord, vesselFeatures } from './ais-vessels';
import { getMapRuntimeConfig, loadTripMapConfig, type MapRuntimeConfig } from './config';
import { mapCachePaths } from './google';
import { getCurrentMapSnapshot } from './service';

export { applyAisMessage, vesselFeatures } from './ais-vessels';

const endpoint = 'wss://stream.aisstream.io/v0/stream';
const defaultHeartbeatMs = 30_000;
const defaultPersistMs = 5_000;
const defaultSilenceAfterMs = 5 * 60 * 1000;
const defaultStaleAfterMs = 24 * 60 * 60 * 1000;
const defaultSubscriptionTimeoutMs = 10_000;
export type AisServiceDependencies = {
	apiKey: string;
	getBounds: () => Promise<MapBounds>;
	now?: () => number;
	random?: () => number;
	cachePath?: string;
	heartbeatMs?: number;
	persistMs?: number;
	silenceAfterMs?: number;
	staleAfterMs?: number;
	subscriptionTimeoutMs?: number;
	createSocket?: () => WebSocket;
};

function rawText(data: RawData): string {
	if (typeof data === 'string') {
		return data;
	}
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString('utf8');
	}
	return Buffer.from(data as ArrayBuffer).toString('utf8');
}

function subscription(apiKey: string, bounds: MapBounds): string {
	const [west, south, east, north] = bounds;
	return JSON.stringify({
		APIKey: apiKey,
		BoundingBoxes: [
			[
				[south, west],
				[north, east]
			]
		],
		FilterMessageTypes: aisMessageTypes
	});
}

export function createAisService(dependencies: AisServiceDependencies): {
	getSnapshot: () => AisApiResponse;
	stop: () => void;
} {
	const now = dependencies.now ?? Date.now;
	const random = dependencies.random ?? Math.random;
	const cachePath = dependencies.cachePath;
	const heartbeatMs = dependencies.heartbeatMs ?? defaultHeartbeatMs;
	const persistMs = dependencies.persistMs ?? defaultPersistMs;
	const silenceAfterMs = dependencies.silenceAfterMs ?? defaultSilenceAfterMs;
	const staleAfterMs = dependencies.staleAfterMs ?? defaultStaleAfterMs;
	const subscriptionTimeoutMs = dependencies.subscriptionTimeoutMs ?? defaultSubscriptionTimeoutMs;
	const createSocket =
		dependencies.createSocket ??
		(() => new WebSocket(endpoint, { perMessageDeflate: true, handshakeTimeout: 10_000 }));
	const vessels = loadVesselCache(cachePath, now(), staleAfterMs);
	let status: AisConnectionStatus = 'idle';
	let socket: WebSocket | undefined;
	let connectPromise: Promise<void> | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let silenceTimer: ReturnType<typeof setTimeout> | undefined;
	let subscriptionTimer: ReturnType<typeof setTimeout> | undefined;
	let persistTimer: ReturnType<typeof setTimeout> | undefined;
	let cacheDirty = false;
	let reconnectAttempt = 0;
	let running = false;
	let awaitingPong = false;
	let lastMessageAt: number | undefined;
	let error: string | undefined;

	function clearSocketTimers(): void {
		if (heartbeatTimer) clearInterval(heartbeatTimer);
		if (silenceTimer) clearTimeout(silenceTimer);
		if (subscriptionTimer) clearTimeout(subscriptionTimer);
		heartbeatTimer = undefined;
		silenceTimer = undefined;
		subscriptionTimer = undefined;
		awaitingPong = false;
	}

	function stop(): void {
		running = false;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		if (persistTimer) clearTimeout(persistTimer);
		reconnectTimer = undefined;
		persistTimer = undefined;
		clearSocketTimers();
		const current = socket;
		socket = undefined;
		current?.close();
		if (cacheDirty && cachePath) {
			persistVesselCache(cachePath, vessels);
			cacheDirty = false;
		}
		status = 'idle';
	}

	function schedulePersistence(): void {
		if (!cachePath) return;
		cacheDirty = true;
		if (persistTimer) return;
		persistTimer = setTimeout(() => {
			persistTimer = undefined;
			persistVesselCache(cachePath, vessels);
			cacheDirty = false;
		}, persistMs);
	}

	function reconnect(): void {
		if (!running || reconnectTimer) {
			if (!running) status = 'idle';
			return;
		}
		status = 'reconnecting';
		const delays = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
		const base = delays[Math.min(reconnectAttempt, delays.length - 1)] as number;
		reconnectAttempt += 1;
		reconnectTimer = setTimeout(
			() => {
				reconnectTimer = undefined;
				void ensureConnected();
			},
			Math.round(base * (1 + random() * 0.25))
		);
	}

	function recycle(nextSocket: WebSocket, nextError: string): void {
		if (socket !== nextSocket) return;
		clearSocketTimers();
		socket = undefined;
		status = 'error';
		error = nextError;
		nextSocket.terminate();
		reconnect();
	}

	function watchForSilence(nextSocket: WebSocket): void {
		if (silenceTimer) clearTimeout(silenceTimer);
		silenceTimer = setTimeout(
			() => recycle(nextSocket, 'AISSTREAM_STREAM_STALLED'),
			silenceAfterMs
		);
	}

	async function connect(): Promise<void> {
		status = reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
		error = undefined;
		let bounds: MapBounds;
		try {
			bounds = await dependencies.getBounds();
		} catch {
			status = 'error';
			error = 'AISSTREAM_MAP_BOUNDS_UNAVAILABLE';
			reconnect();
			return;
		}
		if (!running || socket) {
			return;
		}
		let nextSocket: WebSocket;
		try {
			nextSocket = createSocket();
		} catch {
			status = 'error';
			error = 'AISSTREAM_CONNECTION_FAILED';
			reconnect();
			return;
		}
		socket = nextSocket;
		nextSocket.on('open', (): void => {
			if (socket === nextSocket) {
				nextSocket.send(subscription(dependencies.apiKey, bounds));
				subscriptionTimer = setTimeout(
					() => recycle(nextSocket, 'AISSTREAM_SUBSCRIPTION_TIMEOUT'),
					subscriptionTimeoutMs
				);
			}
		});
		nextSocket.on('pong', (): void => {
			if (socket === nextSocket) awaitingPong = false;
		});
		nextSocket.on('message', (data): void => {
			if (socket !== nextSocket) return;
			awaitingPong = false;
			try {
				const message = JSON.parse(rawText(data));
				const messageRecord = asRecord(message);
				if (messageRecord?.MessageType === 'SubscriptionConfirmation') {
					if (subscriptionTimer) clearTimeout(subscriptionTimer);
					subscriptionTimer = undefined;
					status = 'connected';
					reconnectAttempt = 0;
					error = undefined;
					watchForSilence(nextSocket);
					if (heartbeatTimer) clearInterval(heartbeatTimer);
					heartbeatTimer = setInterval(() => {
						if (socket !== nextSocket) return;
						if (awaitingPong) {
							recycle(nextSocket, 'AISSTREAM_CONNECTION_FAILED');
							return;
						}
						awaitingPong = true;
						nextSocket.ping();
					}, heartbeatMs);
					return;
				}
				if (typeof messageRecord?.error === 'string') {
					recycle(nextSocket, 'AISSTREAM_UPSTREAM_ERROR');
					return;
				}
				if (applyAisMessage(vessels, message, now())) {
					lastMessageAt = now();
					status = 'connected';
					reconnectAttempt = 0;
					error = undefined;
					watchForSilence(nextSocket);
					schedulePersistence();
				}
			} catch {
				return;
			}
		});
		nextSocket.on('error', (): void => {
			recycle(nextSocket, 'AISSTREAM_CONNECTION_FAILED');
		});
		nextSocket.on('close', (): void => {
			if (socket !== nextSocket) return;
			clearSocketTimers();
			socket = undefined;
			reconnect();
		});
	}

	function ensureConnected(): Promise<void> {
		if (socket || reconnectTimer) {
			return Promise.resolve();
		}
		if (!connectPromise) {
			connectPromise = connect().finally(() => {
				connectPromise = undefined;
			});
		}
		return connectPromise;
	}

	function start(): void {
		if (running) return;
		running = true;
		void ensureConnected();
	}

	function getSnapshot(): AisApiResponse {
		start();
		const previousSize = vessels.size;
		const features = vesselFeatures(vessels, now(), staleAfterMs);
		if (vessels.size !== previousSize) schedulePersistence();
		return {
			type: 'FeatureCollection',
			features,
			status,
			...(lastMessageAt !== undefined
				? { lastMessageAt: new Date(lastMessageAt).toISOString() }
				: {}),
			...(error ? { error } : {})
		};
	}

	return { getSnapshot, stop };
}

const configuredServices = new WeakMap<
	Database.Database,
	Map<string, ReturnType<typeof createAisService>>
>();

function getConfiguredAisService(
	db: Database.Database,
	tripId: string,
	config: MapRuntimeConfig
): ReturnType<typeof createAisService> {
	const tripConfig = loadTripMapConfig(db, tripId);
	if (!tripConfig.enabledOverlays.includes('ais')) throw new Error('AIS_DISABLED');
	if (!config.aisStreamApiKey) throw new Error('AIS_NOT_CONFIGURED');
	let services = configuredServices.get(db);
	if (!services) {
		services = new Map();
		configuredServices.set(db, services);
	}
	const key = `${tripId}:${tripConfig.configVersion}`;
	let configuredService = services.get(key);
	if (!configuredService) {
		configuredService = createAisService({
			apiKey: config.aisStreamApiKey,
			cachePath: join(mapCachePaths(config.dataDir, tripId).directory, 'ais-vessels.json'),
			getBounds: async () => (await getCurrentMapSnapshot(tripId, db, config)).bounds
		});
		services.set(key, configuredService);
	}
	return configuredService;
}

export function handleGetAis(
	tripId: string,
	db: Database.Database,
	config: MapRuntimeConfig = getMapRuntimeConfig()
): Response {
	try {
		return apiSuccess(getConfiguredAisService(db, tripId, config).getSnapshot());
	} catch (error) {
		if (error instanceof Error && error.message === 'AIS_DISABLED') {
			return apiError('AIS_DISABLED', 409);
		}
		return apiError('AIS_UNAVAILABLE', 503);
	}
}
