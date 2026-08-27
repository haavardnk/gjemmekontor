import { z } from 'zod';

import type { JsonValue } from '$lib/client/database';

export const mooringChoices = [
	{ value: 'anchor', label: 'Anker' },
	{ value: 'mooring-ball', label: 'Bøye' },
	{ value: 'quay', label: 'Kai' },
	{ value: 'marina', label: 'Marina' },
	{ value: 'other', label: 'Annet' }
] as const;

const locationSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('text'), name: z.string().min(1).max(200) }),
	z.object({
		kind: z.literal('map'),
		featureId: z.string().min(1),
		name: z.string().min(1).max(200),
		coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
	})
]);

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const gpxPositionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const gpxBlockSchema = z.object({
	startedAt: z.iso.datetime(),
	endedAt: z.iso.datetime(),
	durationSeconds: z.number().int().nonnegative()
});

export const logbookGpxSchema = z.object({
	id: z.uuid(),
	filename: z.string().min(1).max(200),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
	byteSize: z.number().int().positive().max(5_000_000),
	version: z.literal(1),
	name: z.string().min(1).max(200),
	departureAt: z.iso.datetime(),
	arrivalAt: z.iso.datetime(),
	nauticalMiles: z.number().positive().max(500),
	activeSeconds: z.number().int().nonnegative(),
	elapsedSeconds: z.number().int().nonnegative(),
	stationarySeconds: z.number().int().nonnegative(),
	originalPointCount: z.number().int().positive(),
	routePointCount: z.number().int().positive(),
	segments: z.array(z.array(gpxPositionSchema).min(2)).min(1),
	stationaryBlocks: z.array(gpxBlockSchema),
	recordingGaps: z.array(gpxBlockSchema)
});

export const logbookLegSchema = z.object({
	from: locationSchema,
	to: locationSchema,
	departure: timeSchema,
	arrival: timeSchema,
	nauticalMiles: z.number().min(0).max(500),
	sailingMinutes: z.number().int().min(0).max(1440),
	engineMinutes: z.number().int().min(0).max(1440),
	mooring: z.enum(['anchor', 'mooring-ball', 'quay', 'marina', 'other']),
	customMooring: z.string().max(100),
	gpx: logbookGpxSchema.optional(),
	createdAt: z.string(),
	createdBy: z.string().min(1),
	tombstone: z.boolean()
});

export type LocationReference = z.infer<typeof locationSchema>;
export type LogbookLeg = z.infer<typeof logbookLegSchema>;
export type LogbookGpx = z.infer<typeof logbookGpxSchema>;
export type KeyedLogbookLeg = LogbookLeg & { key: string };

export function logbookLegKey(dayId: string, id: string): string {
	return `logbook:day:${dayId}:leg:${id}`;
}

export function logbookLegs(values: Record<string, JsonValue>, dayId: string): KeyedLogbookLeg[] {
	const prefix = `logbook:day:${dayId}:leg:`;
	return Object.entries(values)
		.filter(([key]) => key.startsWith(prefix))
		.flatMap(([key, value]) => {
			const parsed = logbookLegSchema.safeParse(value);
			return parsed.success && !parsed.data.tombstone ? [{ key, ...parsed.data }] : [];
		})
		.sort(
			(left, right) =>
				left.departure.localeCompare(right.departure) ||
				left.createdAt.localeCompare(right.createdAt) ||
				left.key.localeCompare(right.key)
		);
}

export function logbookTotals(legs: LogbookLeg[]): {
	nauticalMiles: number;
	sailingMinutes: number;
	engineMinutes: number;
	legCount: number;
} {
	return legs.reduce(
		(total, leg) => ({
			nauticalMiles: total.nauticalMiles + leg.nauticalMiles,
			sailingMinutes: total.sailingMinutes + leg.sailingMinutes,
			engineMinutes: total.engineMinutes + leg.engineMinutes,
			legCount: total.legCount + 1
		}),
		{ nauticalMiles: 0, sailingMinutes: 0, engineMinutes: 0, legCount: 0 }
	);
}

export function serializeLocation(location: LocationReference | null): JsonValue {
	if (!location) {
		return null;
	}
	return location.kind === 'map'
		? {
				kind: 'map',
				featureId: location.featureId,
				name: location.name,
				coordinates: location.coordinates
			}
		: { kind: 'text', name: location.name };
}

export function parseLocation(value: JsonValue | undefined): LocationReference | undefined {
	const parsed = locationSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}

export function serializeLogbookLeg(leg: LogbookLeg): JsonValue {
	return {
		from: serializeLocation(leg.from),
		to: serializeLocation(leg.to),
		departure: leg.departure,
		arrival: leg.arrival,
		nauticalMiles: leg.nauticalMiles,
		sailingMinutes: leg.sailingMinutes,
		engineMinutes: leg.engineMinutes,
		mooring: leg.mooring,
		customMooring: leg.customMooring,
		...(leg.gpx ? { gpx: leg.gpx } : {}),
		createdAt: leg.createdAt,
		createdBy: leg.createdBy,
		tombstone: leg.tombstone
	};
}
