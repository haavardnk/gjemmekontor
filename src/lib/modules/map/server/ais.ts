import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type Database from 'better-sqlite3';
import WebSocket, { type RawData } from 'ws';

import type {
	AisApiResponse,
	AisConnectionStatus,
	AisVesselFeature
} from '$lib/modules/map/domain/ais';
import type { MapBounds } from '$lib/modules/map/domain/types';
import { apiError, apiSuccess } from '$lib/server/api';

import { getMapRuntimeConfig, loadTripMapConfig, type MapRuntimeConfig } from './config';
import { mapCachePaths } from './google';
import { getCurrentMapSnapshot } from './service';

const endpoint = 'wss://stream.aisstream.io/v0/stream';
const defaultHeartbeatMs = 30_000;
const defaultPersistMs = 5_000;
const defaultSilenceAfterMs = 5 * 60 * 1000;
const defaultStaleAfterMs = 24 * 60 * 60 * 1000;
const defaultSubscriptionTimeoutMs = 10_000;
const positionMessageTypes = new Set([
	'PositionReport',
	'StandardClassBPositionReport',
	'ExtendedClassBPositionReport',
	'LongRangeAisBroadcastMessage'
]);
const requestedMessageTypes = [...positionMessageTypes, 'ShipStaticData', 'StaticDataReport'];

type JsonRecord = Record<string, unknown>;

type VesselState = {
	mmsi: number;
	updatedAt: number;
	longitude?: number;
	latitude?: number;
	name: string;
	callSign?: string;
	imoNumber?: number;
	destination?: string;
	shipType?: number;
	navigationStatus?: number;
	speedOverGround?: number;
	courseOverGround?: number;
	trueHeading?: number;
	lengthMeters?: number;
	widthMeters?: number;
	draughtMeters?: number;
	lastPositionAt?: number;
};

type VesselCache = {
	version: 1;
	vessels: VesselState[];
};

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

function record(value: unknown): JsonRecord | undefined {
	return value !== null && typeof value === 'object' ? (value as JsonRecord) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function integer(value: unknown): number | undefined {
	const number = finiteNumber(value);
	return number !== undefined && Number.isInteger(number) ? number : undefined;
}

function text(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalized = value.replace(/@+$/g, '').trim();
	return normalized || undefined;
}

function assignDefined<T extends object>(target: T, values: Partial<T>): void {
	for (const [key, value] of Object.entries(values)) {
		if (value !== undefined) {
			(target as Record<string, unknown>)[key] = value;
		}
	}
}

function cachedVessel(value: unknown, now: number, staleAfterMs: number): VesselState | undefined {
	const candidate = record(value);
	const mmsi = integer(candidate?.mmsi);
	const updatedAt = finiteNumber(candidate?.updatedAt);
	if (
		mmsi === undefined ||
		mmsi <= 0 ||
		updatedAt === undefined ||
		now - updatedAt > staleAfterMs
	) {
		return undefined;
	}
	const vessel: VesselState = {
		mmsi,
		updatedAt,
		name: text(candidate?.name) ?? ''
	};
	assignDefined(vessel, {
		longitude: finiteNumber(candidate?.longitude),
		latitude: finiteNumber(candidate?.latitude),
		callSign: text(candidate?.callSign),
		imoNumber: integer(candidate?.imoNumber),
		destination: text(candidate?.destination),
		shipType: integer(candidate?.shipType),
		navigationStatus: integer(candidate?.navigationStatus),
		speedOverGround: finiteNumber(candidate?.speedOverGround),
		courseOverGround: finiteNumber(candidate?.courseOverGround),
		trueHeading: integer(candidate?.trueHeading),
		lengthMeters: finiteNumber(candidate?.lengthMeters),
		widthMeters: finiteNumber(candidate?.widthMeters),
		draughtMeters: finiteNumber(candidate?.draughtMeters),
		lastPositionAt: finiteNumber(candidate?.lastPositionAt)
	});
	return vessel;
}

function loadVesselCache(path: string | undefined, now: number, staleAfterMs: number) {
	const vessels = new Map<number, VesselState>();
	if (!path) return vessels;
	try {
		const cache = JSON.parse(readFileSync(path, 'utf8')) as Partial<VesselCache>;
		if (cache.version !== 1 || !Array.isArray(cache.vessels)) return vessels;
		for (const value of cache.vessels) {
			const vessel = cachedVessel(value, now, staleAfterMs);
			if (vessel) vessels.set(vessel.mmsi, vessel);
		}
	} catch {
		return vessels;
	}
	return vessels;
}

function persistVesselCache(path: string, vessels: Map<number, VesselState>): void {
	const temporaryPath = `${path}.${randomUUID()}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(
			temporaryPath,
			JSON.stringify({ version: 1, vessels: [...vessels.values()] } satisfies VesselCache),
			{ encoding: 'utf8', mode: 0o600 }
		);
		renameSync(temporaryPath, path);
	} catch {
		try {
			rmSync(temporaryPath, { force: true });
		} catch {
			return;
		}
		return;
	}
}

function dimensions(value: unknown): { lengthMeters?: number; widthMeters?: number } {
	const dimension = record(value);
	if (!dimension) {
		return {};
	}
	const a = finiteNumber(dimension.A);
	const b = finiteNumber(dimension.B);
	const c = finiteNumber(dimension.C);
	const d = finiteNumber(dimension.D);
	const length = a !== undefined && b !== undefined ? a + b : undefined;
	const width = c !== undefined && d !== undefined ? c + d : undefined;
	return {
		...(length !== undefined && length > 0 ? { lengthMeters: length } : {}),
		...(width !== undefined && width > 0 ? { widthMeters: width } : {})
	};
}

function metadataPosition(metadata: JsonRecord | undefined): {
	longitude?: number;
	latitude?: number;
} {
	return {
		longitude: finiteNumber(metadata?.Longitude ?? metadata?.longitude),
		latitude: finiteNumber(metadata?.Latitude ?? metadata?.latitude)
	};
}

function validPosition(longitude: number | undefined, latitude: number | undefined): boolean {
	return (
		longitude !== undefined &&
		latitude !== undefined &&
		longitude >= -180 &&
		longitude <= 180 &&
		latitude >= -90 &&
		latitude <= 90
	);
}

function staticFields(messageType: string, body: JsonRecord): Partial<VesselState> {
	if (messageType === 'StaticDataReport') {
		const reportA = record(body.ReportA);
		const reportB = record(body.ReportB);
		return {
			name: text(reportA?.Name),
			callSign: text(reportB?.CallSign),
			shipType: integer(reportB?.ShipType),
			...dimensions(reportB?.Dimension)
		};
	}
	return {
		name: text(body.Name),
		callSign: text(body.CallSign),
		imoNumber: integer(body.ImoNumber),
		destination: text(body.Destination),
		shipType: integer(body.Type),
		draughtMeters: finiteNumber(body.MaximumStaticDraught),
		...dimensions(body.Dimension)
	};
}

export function applyAisMessage(
	vessels: Map<number, VesselState>,
	value: unknown,
	now: number
): boolean {
	const envelope = record(value);
	const messageType = typeof envelope?.MessageType === 'string' ? envelope.MessageType : undefined;
	const metadata = record(envelope?.MetaData);
	const messages = record(envelope?.Message);
	const body = messageType && messages ? record(messages[messageType]) : undefined;
	if (!messageType || !body) {
		return false;
	}
	const mmsi = integer(metadata?.MMSI) ?? integer(body.UserID);
	if (mmsi === undefined || mmsi <= 0) {
		return false;
	}
	const existing = vessels.get(mmsi);
	const vessel: VesselState = existing ?? {
		mmsi,
		updatedAt: now,
		name: text(metadata?.ShipName) ?? ''
	};
	vessel.updatedAt = now;
	assignDefined(vessel, {
		name: text(metadata?.ShipName),
		...staticFields(messageType, body)
	});

	const isPosition = positionMessageTypes.has(messageType);
	const fallbackPosition = metadataPosition(metadata);
	const longitude = isPosition ? finiteNumber(body.Longitude) : fallbackPosition.longitude;
	const latitude = isPosition ? finiteNumber(body.Latitude) : fallbackPosition.latitude;
	if (isPosition && body.Valid === false) {
		return false;
	}
	if (validPosition(longitude, latitude)) {
		assignDefined(vessel, { longitude, latitude });
		vessel.lastPositionAt = now;
	}
	if (isPosition) {
		assignDefined(vessel, {
			navigationStatus: integer(body.NavigationalStatus),
			speedOverGround: finiteNumber(body.Sog),
			courseOverGround: finiteNumber(body.Cog),
			trueHeading: integer(body.TrueHeading),
			...staticFields(messageType, body)
		});
	}
	vessels.set(mmsi, vessel);
	return true;
}

function direction(vessel: VesselState): number {
	if (vessel.trueHeading !== undefined && vessel.trueHeading >= 0 && vessel.trueHeading < 360) {
		return vessel.trueHeading;
	}
	if (
		vessel.courseOverGround !== undefined &&
		vessel.courseOverGround >= 0 &&
		vessel.courseOverGround < 360
	) {
		return vessel.courseOverGround;
	}
	return 0;
}

export function vesselFeatures(
	vessels: Map<number, VesselState>,
	now: number,
	staleAfterMs: number
): AisVesselFeature[] {
	const features: AisVesselFeature[] = [];
	for (const [mmsi, vessel] of vessels) {
		if (now - vessel.updatedAt > staleAfterMs) {
			vessels.delete(mmsi);
			continue;
		}
		if (
			vessel.lastPositionAt === undefined ||
			now - vessel.lastPositionAt > staleAfterMs ||
			!validPosition(vessel.longitude, vessel.latitude)
		) {
			continue;
		}
		features.push({
			type: 'Feature',
			id: `ais-${mmsi}`,
			geometry: {
				type: 'Point',
				coordinates: [vessel.longitude as number, vessel.latitude as number]
			},
			properties: {
				mmsi,
				name: vessel.name || `Fartøy ${mmsi}`,
				direction: direction(vessel),
				lastSeenAt: new Date(vessel.lastPositionAt).toISOString(),
				...(vessel.callSign ? { callSign: vessel.callSign } : {}),
				...(vessel.imoNumber !== undefined ? { imoNumber: vessel.imoNumber } : {}),
				...(vessel.destination ? { destination: vessel.destination } : {}),
				...(vessel.shipType !== undefined ? { shipType: vessel.shipType } : {}),
				...(vessel.navigationStatus !== undefined
					? { navigationStatus: vessel.navigationStatus }
					: {}),
				...(vessel.speedOverGround !== undefined
					? { speedOverGround: vessel.speedOverGround }
					: {}),
				...(vessel.courseOverGround !== undefined
					? { courseOverGround: vessel.courseOverGround }
					: {}),
				...(vessel.trueHeading !== undefined ? { trueHeading: vessel.trueHeading } : {}),
				...(vessel.lengthMeters !== undefined ? { lengthMeters: vessel.lengthMeters } : {}),
				...(vessel.widthMeters !== undefined ? { widthMeters: vessel.widthMeters } : {}),
				...(vessel.draughtMeters !== undefined ? { draughtMeters: vessel.draughtMeters } : {})
			}
		});
	}
	return features;
}

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
		FilterMessageTypes: requestedMessageTypes
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
				const messageRecord = record(message);
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
