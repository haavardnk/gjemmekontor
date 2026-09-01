import type { gpx } from '@tmcw/togeojson';

export const gpxExtractionVersion = 1;
export const gpxMaximumBytes = 5_000_000;
export const gpxMaximumPoints = 50_000;

export type GpxDocument = Parameters<typeof gpx>[0];

export type GpxPoint = {
	position: [longitude: number, latitude: number];
	time: string;
	timeMs: number;
};

export type NormalizedGpx = {
	name: string;
	segments: Array<{ points: GpxPoint[] }>;
};

export type GpxStationaryBlock = {
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
};

export type GpxRecordingGap = {
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
};

export type GpxExtraction = {
	version: 1;
	name: string;
	departureAt: string;
	arrivalAt: string;
	nauticalMiles: number;
	activeSeconds: number;
	elapsedSeconds: number;
	stationarySeconds: number;
	originalPointCount: number;
	routePointCount: number;
	segments: [number, number][][];
	stationaryBlocks: GpxStationaryBlock[];
	recordingGaps: GpxRecordingGap[];
};
