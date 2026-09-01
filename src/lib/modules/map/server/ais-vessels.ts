import type { AisVesselFeature } from '$lib/modules/map/domain/ais';

type JsonRecord = Record<string, unknown>;

export type VesselState = {
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

const positionMessageTypes = new Set([
	'PositionReport',
	'StandardClassBPositionReport',
	'ExtendedClassBPositionReport',
	'LongRangeAisBroadcastMessage'
]);

export const aisMessageTypes = [...positionMessageTypes, 'ShipStaticData', 'StaticDataReport'];

export function asRecord(value: unknown): JsonRecord | undefined {
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
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/@+$/g, '').trim();
	return normalized || undefined;
}

function assignDefined<T extends object>(target: T, values: Partial<T>): void {
	for (const [key, value] of Object.entries(values)) {
		if (value !== undefined) (target as Record<string, unknown>)[key] = value;
	}
}

export function vesselFromCache(
	value: unknown,
	now: number,
	staleAfterMs: number
): VesselState | undefined {
	const candidate = asRecord(value);
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
	const vessel: VesselState = { mmsi, updatedAt, name: text(candidate?.name) ?? '' };
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

function dimensions(value: unknown): { lengthMeters?: number; widthMeters?: number } {
	const dimension = asRecord(value);
	if (!dimension) return {};
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
		const reportA = asRecord(body.ReportA);
		const reportB = asRecord(body.ReportB);
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
	const envelope = asRecord(value);
	const messageType = typeof envelope?.MessageType === 'string' ? envelope.MessageType : undefined;
	const metadata = asRecord(envelope?.MetaData);
	const messages = asRecord(envelope?.Message);
	const body = messageType && messages ? asRecord(messages[messageType]) : undefined;
	if (!messageType || !body) return false;

	const mmsi = integer(metadata?.MMSI) ?? integer(body.UserID);
	if (mmsi === undefined || mmsi <= 0) return false;
	const vessel: VesselState = vessels.get(mmsi) ?? {
		mmsi,
		updatedAt: now,
		name: text(metadata?.ShipName) ?? ''
	};
	vessel.updatedAt = now;
	assignDefined(vessel, { name: text(metadata?.ShipName), ...staticFields(messageType, body) });

	const isPosition = positionMessageTypes.has(messageType);
	const fallbackPosition = metadataPosition(metadata);
	const longitude = isPosition ? finiteNumber(body.Longitude) : fallbackPosition.longitude;
	const latitude = isPosition ? finiteNumber(body.Latitude) : fallbackPosition.latitude;
	if (isPosition && body.Valid === false) return false;
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
