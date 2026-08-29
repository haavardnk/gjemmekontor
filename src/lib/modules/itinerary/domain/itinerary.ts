import { z } from 'zod';

import type { JsonValue } from '$lib/client/database';

export const transportModeValues = [
	'flight',
	'train',
	'bus',
	'ferry',
	'taxi',
	'transfer',
	'other'
] as const;
export type TransportMode = (typeof transportModeValues)[number];

export const transportModeLabels: Record<TransportMode, string> = {
	flight: 'Fly',
	train: 'Tog',
	bus: 'Buss',
	ferry: 'Ferge / båt',
	taxi: 'Taxi',
	transfer: 'Privat transport',
	other: 'Annen transport'
};

export const itineraryKindValues = ['journey', 'stay', 'rental', 'booking', 'note'] as const;
export type ItineraryKind = (typeof itineraryKindValues)[number];

const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const itineraryEndpointSchema = z
	.object({
		locationName: z.string().trim().min(1).max(200),
		locationCode: z.string().trim().max(12),
		localDateTime: localDateTimeSchema,
		timeZone: z.string().trim().min(1).max(100),
		instant: z.iso.datetime(),
		terminal: z.string().trim().max(50),
		gate: z.string().trim().max(50),
		platform: z.string().trim().max(50)
	})
	.strict();

export type ItineraryEndpoint = z.infer<typeof itineraryEndpointSchema>;
export type EditableItineraryEndpoint = Omit<ItineraryEndpoint, 'instant'>;

const flightProviderSchema = z
	.object({
		name: z.literal('flightaware'),
		flightId: z.string().min(1).max(200),
		lastRefreshedAt: z.iso.datetime()
	})
	.strict();

export const itineraryLegSchema = z
	.object({
		id: z.uuid(),
		mode: z.enum(transportModeValues),
		operator: z.string().trim().max(100),
		serviceNumber: z.string().trim().max(30),
		from: itineraryEndpointSchema,
		to: itineraryEndpointSchema,
		status: z.enum(['planned', 'delayed', 'cancelled', 'completed']),
		notes: z.string().trim().max(1000),
		provider: flightProviderSchema.optional()
	})
	.strict()
	.refine((leg) => new Date(leg.to.instant).getTime() >= new Date(leg.from.instant).getTime(), {
		message: 'Arrival must not be before departure',
		path: ['to', 'instant']
	});

export type ItineraryLeg = z.infer<typeof itineraryLegSchema>;

const commonFields = {
	id: z.uuid(),
	title: z.string().trim().min(1).max(200),
	bookingReference: z.string().trim().max(100),
	bookingUrl: z.union([z.literal(''), z.url().max(1000)]),
	participants: z.array(z.string().trim().min(1).max(100)).max(50),
	notes: z.string().trim().max(4000),
	createdAt: z.iso.datetime(),
	createdBy: z.string().min(1).max(128),
	updatedAt: z.iso.datetime(),
	tombstone: z.boolean(),
	version: z.literal(1)
} as const;

export const journeySchema = z
	.object({
		...commonFields,
		kind: z.literal('journey'),
		groupId: z.uuid(),
		direction: z.enum(['one-way', 'outbound', 'return']),
		legs: z.array(itineraryLegSchema).min(1).max(12)
	})
	.strict();

export const staySchema = z
	.object({
		...commonFields,
		kind: z.literal('stay'),
		subtype: z.enum(['hotel', 'holiday-rental', 'camping', 'other']),
		checkIn: itineraryEndpointSchema,
		checkOut: itineraryEndpointSchema
	})
	.strict()
	.refine(
		(stay) => new Date(stay.checkOut.instant).getTime() >= new Date(stay.checkIn.instant).getTime(),
		{ message: 'Checkout must not be before check-in', path: ['checkOut', 'instant'] }
	);

export const rentalSchema = z
	.object({
		...commonFields,
		kind: z.literal('rental'),
		subtype: z.enum(['car', 'boat', 'bike', 'equipment', 'other']),
		pickup: itineraryEndpointSchema,
		return: itineraryEndpointSchema
	})
	.strict()
	.refine(
		(rental) =>
			new Date(rental.return.instant).getTime() >= new Date(rental.pickup.instant).getTime(),
		{ message: 'Return must not be before pickup', path: ['return', 'instant'] }
	);

export const bookingSchema = z
	.object({
		...commonFields,
		kind: z.literal('booking'),
		subtype: z.enum(['activity', 'restaurant', 'event', 'appointment', 'other']),
		start: itineraryEndpointSchema,
		end: itineraryEndpointSchema.optional()
	})
	.strict()
	.refine(
		(booking) =>
			!booking.end ||
			new Date(booking.end.instant).getTime() >= new Date(booking.start.instant).getTime(),
		{ message: 'End must not be before start', path: ['end', 'instant'] }
	);

export const noteSchema = z
	.object({
		...commonFields,
		kind: z.literal('note'),
		at: itineraryEndpointSchema
	})
	.strict();

export const itineraryItemSchema = z.discriminatedUnion('kind', [
	journeySchema,
	staySchema,
	rentalSchema,
	bookingSchema,
	noteSchema
]);

export type Journey = z.infer<typeof journeySchema>;
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type KeyedItineraryItem = ItineraryItem & { key: string };

export type TimelineEventType =
	| 'journey-leg'
	| 'check-in'
	| 'check-out'
	| 'pickup'
	| 'return'
	| 'booking-start'
	| 'booking-end'
	| 'note';

export type TimelineEvent = {
	id: string;
	sourceKey: string;
	itemId: string;
	kind: ItineraryKind;
	type: TimelineEventType;
	title: string;
	label: string;
	detail: string;
	endpoint: ItineraryEndpoint;
	endEndpoint?: ItineraryEndpoint;
	connectionMinutes?: number;
	mode?: TransportMode;
	legIndex?: number;
	status?: ItineraryLeg['status'];
};

export function itineraryItemKey(id: string): string {
	return `itinerary:item:${id}`;
}

export function itineraryItems(values: Record<string, JsonValue>): KeyedItineraryItem[] {
	return Object.entries(values)
		.filter(([key]) => key.startsWith('itinerary:item:'))
		.flatMap(([key, value]) => {
			const parsed = itineraryItemSchema.safeParse(value);
			return parsed.success && !parsed.data.tombstone ? [{ key, ...parsed.data }] : [];
		})
		.sort(
			(left, right) =>
				firstInstant(left).localeCompare(firstInstant(right)) || left.id.localeCompare(right.id)
		);
}

export function serializeItineraryItem(item: ItineraryItem): JsonValue {
	return item as JsonValue;
}

function endpointName(endpoint: ItineraryEndpoint): string {
	return endpoint.locationCode
		? `${endpoint.locationName} (${endpoint.locationCode.toUpperCase()})`
		: endpoint.locationName;
}

function serviceDetail(leg: ItineraryLeg): string {
	return [leg.operator, leg.serviceNumber].filter(Boolean).join(' · ');
}

function endpointShortName(
	endpoint: Pick<ItineraryEndpoint, 'locationCode' | 'locationName'>
): string {
	return endpoint.locationCode.toUpperCase() || endpoint.locationName;
}

export function journeyTitle(legs: readonly Pick<ItineraryLeg, 'from' | 'to'>[]): string {
	const first = legs[0];
	const last = legs.at(-1);
	if (!first || !last) return 'Transport';
	return `${endpointShortName(first.from)} → ${endpointShortName(last.to)}`;
}

function sameLocation(left: ItineraryEndpoint, right: ItineraryEndpoint): boolean {
	if (left.locationCode && right.locationCode) {
		return left.locationCode.toLocaleUpperCase() === right.locationCode.toLocaleUpperCase();
	}
	return (
		left.locationName.trim().toLocaleLowerCase('nb-NO') ===
		right.locationName.trim().toLocaleLowerCase('nb-NO')
	);
}

function journeyEvents(item: Journey & { key: string }): TimelineEvent[] {
	return item.legs.map((leg, index): TimelineEvent => {
		const previous = item.legs[index - 1];
		const connectionMinutes =
			previous && sameLocation(previous.to, leg.from)
				? Math.round(
						(new Date(leg.from.instant).getTime() - new Date(previous.to.instant).getTime()) /
							60_000
					)
				: undefined;
		return {
			id: `${leg.id}:journey-leg`,
			sourceKey: item.key,
			itemId: item.id,
			kind: item.kind,
			type: 'journey-leg',
			title: item.title,
			label: serviceDetail(leg) || transportModeLabels[leg.mode],
			detail: `${endpointName(leg.from)} → ${endpointName(leg.to)}`,
			endpoint: leg.from,
			endEndpoint: leg.to,
			connectionMinutes,
			mode: leg.mode,
			legIndex: index,
			status: leg.status
		};
	});
}

function simpleEvent(
	item: KeyedItineraryItem,
	type: TimelineEventType,
	label: string,
	endpoint: ItineraryEndpoint
): TimelineEvent {
	return {
		id: `${item.id}:${type}`,
		sourceKey: item.key,
		itemId: item.id,
		kind: item.kind,
		type,
		title: item.title,
		label,
		detail: endpointName(endpoint),
		endpoint
	};
}

export function timelineEvents(items: readonly KeyedItineraryItem[]): TimelineEvent[] {
	return items
		.flatMap((item): TimelineEvent[] => {
			switch (item.kind) {
				case 'journey':
					return journeyEvents(item);
				case 'stay':
					return [
						simpleEvent(item, 'check-in', 'Innsjekking', item.checkIn),
						simpleEvent(item, 'check-out', 'Utsjekking', item.checkOut)
					];
				case 'rental':
					return [
						simpleEvent(item, 'pickup', 'Henting', item.pickup),
						simpleEvent(item, 'return', 'Levering', item.return)
					];
				case 'booking':
					return [
						simpleEvent(item, 'booking-start', 'Starter', item.start),
						...(item.end ? [simpleEvent(item, 'booking-end', 'Slutter', item.end)] : [])
					];
				case 'note':
					return [simpleEvent(item, 'note', 'Påminnelse', item.at)];
			}
		})
		.sort(
			(left, right) =>
				left.endpoint.instant.localeCompare(right.endpoint.instant) ||
				left.id.localeCompare(right.id)
		);
}

export function firstInstant(item: ItineraryItem): string {
	switch (item.kind) {
		case 'journey':
			return item.legs[0]?.from.instant ?? '';
		case 'stay':
			return item.checkIn.instant;
		case 'rental':
			return item.pickup.instant;
		case 'booking':
			return item.start.instant;
		case 'note':
			return item.at.instant;
	}
}

export function localDateTimeToInstant(localDateTime: string, timeZone: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
	if (!match) throw new Error('INVALID_LOCAL_DATETIME');
	const [, year, month, day, hour, minute] = match;
	const intended = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute)
	);
	let candidate = intended;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(candidate));
		const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
		const represented = Date.UTC(
			Number(values.year),
			Number(values.month) - 1,
			Number(values.day),
			Number(values.hour),
			Number(values.minute)
		);
		const difference = intended - represented;
		candidate += difference;
		if (difference === 0) return new Date(candidate).toISOString();
	}
	throw new Error('INVALID_TIME_ZONE_DATETIME');
}

export function instantToLocalDateTime(instant: string, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date(instant));
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
