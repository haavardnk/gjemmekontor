import type { Position } from './types';

export type AisConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type AisVesselProperties = {
	mmsi: number;
	name: string;
	callSign?: string;
	imoNumber?: number;
	destination?: string;
	shipType?: number;
	navigationStatus?: number;
	speedOverGround?: number;
	courseOverGround?: number;
	trueHeading?: number;
	direction: number;
	lengthMeters?: number;
	widthMeters?: number;
	draughtMeters?: number;
	lastSeenAt: string;
};

export type AisVesselFeature = {
	type: 'Feature';
	id: string;
	geometry: { type: 'Point'; coordinates: Position };
	properties: AisVesselProperties;
};

export type AisApiResponse = {
	type: 'FeatureCollection';
	features: AisVesselFeature[];
	status: AisConnectionStatus;
	lastMessageAt?: string;
	error?: string;
};
