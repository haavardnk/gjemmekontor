import { z } from 'zod';

import {
	instantToLocalDateTime,
	type ItineraryEndpoint,
	type ItineraryLeg
} from '../domain/itinerary';

const airportSchema = z
	.object({
		code: z.string().optional().nullable(),
		code_iata: z.string().optional().nullable(),
		code_icao: z.string().optional().nullable(),
		name: z.string().optional().nullable(),
		timezone: z.string().optional().nullable()
	})
	.passthrough();

const flightSchema = z
	.object({
		fa_flight_id: z.string(),
		ident: z.string().optional().nullable(),
		ident_iata: z.string().optional().nullable(),
		operator: z.string().optional().nullable(),
		operator_iata: z.string().optional().nullable(),
		flight_number: z.string().optional().nullable(),
		origin: airportSchema,
		destination: airportSchema,
		scheduled_out: z.iso.datetime().optional().nullable(),
		scheduled_in: z.iso.datetime().optional().nullable(),
		estimated_out: z.iso.datetime().optional().nullable(),
		estimated_in: z.iso.datetime().optional().nullable(),
		actual_out: z.iso.datetime().optional().nullable(),
		actual_in: z.iso.datetime().optional().nullable(),
		cancelled: z.boolean().optional(),
		status: z.string().optional().nullable(),
		terminal_origin: z.string().optional().nullable(),
		terminal_destination: z.string().optional().nullable(),
		gate_origin: z.string().optional().nullable(),
		gate_destination: z.string().optional().nullable()
	})
	.passthrough();

const responseSchema = z.object({ flights: z.array(flightSchema) }).passthrough();

const scheduledFlightSchema = z
	.object({
		ident: z.string(),
		ident_icao: z.string().optional().nullable(),
		ident_iata: z.string().optional().nullable(),
		actual_ident: z.string().optional().nullable(),
		actual_ident_icao: z.string().optional().nullable(),
		actual_ident_iata: z.string().optional().nullable(),
		origin: z.string(),
		origin_icao: z.string().optional().nullable(),
		origin_iata: z.string().optional().nullable(),
		destination: z.string(),
		destination_icao: z.string().optional().nullable(),
		destination_iata: z.string().optional().nullable(),
		scheduled_out: z.iso.datetime(),
		scheduled_in: z.iso.datetime(),
		fa_flight_id: z.string().optional().nullable()
	})
	.passthrough();

const scheduleResponseSchema = z
	.object({ scheduled: z.array(scheduledFlightSchema) })
	.passthrough();

const airportDetailsSchema = z
	.object({
		airport_code: z.string(),
		code_iata: z.string().optional().nullable(),
		code_icao: z.string().optional().nullable(),
		name: z.string(),
		timezone: z.string()
	})
	.passthrough();

export type FlightLookupCandidate = {
	providerFlightId: string;
	flightNumber: string;
	operator: string;
	status: ItineraryLeg['status'];
	from: ItineraryEndpoint;
	to: ItineraryEndpoint;
	scheduledFrom: string;
	scheduledTo: string;
};

export class FlightAwareProviderError extends Error {
	constructor(
		readonly status: number,
		readonly reason: string,
		readonly detail: string
	) {
		super(`FLIGHTAWARE_${status}`);
	}
}

async function flightAwareJson(apiKey: string, url: URL, fetcher: typeof fetch): Promise<unknown> {
	const response = await fetcher(url, {
		headers: { Accept: 'application/json', 'x-apikey': apiKey },
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => undefined);
		const reason =
			body && typeof body === 'object' && 'reason' in body && typeof body.reason === 'string'
				? body.reason
				: 'UNKNOWN';
		const detail =
			body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
				? body.detail
				: '';
		throw new FlightAwareProviderError(response.status, reason, detail);
	}
	return response.json();
}

function endpoint(
	airport: z.infer<typeof airportSchema>,
	instant: string,
	terminal: string | null | undefined,
	gate: string | null | undefined
): ItineraryEndpoint {
	const timeZone = airport.timezone || 'UTC';
	return {
		locationName:
			airport.name || airport.code_iata || airport.code || airport.code_icao || 'Ukjent',
		locationCode: airport.code_iata || airport.code || airport.code_icao || '',
		localDateTime: instantToLocalDateTime(instant, timeZone),
		timeZone,
		instant,
		terminal: terminal || '',
		gate: gate || '',
		platform: ''
	};
}

function flightStatus(flight: z.infer<typeof flightSchema>): ItineraryLeg['status'] {
	if (flight.cancelled || flight.status?.toLocaleLowerCase().includes('cancel')) return 'cancelled';
	if (flight.actual_in) return 'completed';
	const scheduled = flight.scheduled_out ? new Date(flight.scheduled_out).getTime() : undefined;
	const estimated = flight.estimated_out ? new Date(flight.estimated_out).getTime() : undefined;
	return scheduled !== undefined && estimated !== undefined && estimated - scheduled >= 15 * 60_000
		? 'delayed'
		: 'planned';
}

function nextDate(date: string): string {
	const value = new Date(`${date}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + 1);
	return value.toISOString().slice(0, 10);
}

function flightNumberParts(flightNumber: string): { airline: string; number: string } | undefined {
	const match = /^([A-Z]{2,3})(\d+[A-Z]?)$/.exec(flightNumber);
	return match ? { airline: match[1]!, number: match[2]! } : undefined;
}

function futureWindowError(error: unknown): boolean {
	return (
		error instanceof FlightAwareProviderError &&
		error.status === 400 &&
		(error.detail.toLowerCase().includes('too far in the future') ||
			error.detail.toLowerCase().includes('future schedules'))
	);
}

async function airportDetails(
	apiKey: string,
	airportCode: string,
	fetcher: typeof fetch
): Promise<z.infer<typeof airportSchema>> {
	const url = new URL(
		`https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}`
	);
	const parsed = airportDetailsSchema.safeParse(await flightAwareJson(apiKey, url, fetcher));
	if (!parsed.success) throw new Error('INVALID_FLIGHTAWARE_AIRPORT_RESPONSE');
	return {
		code: parsed.data.airport_code,
		code_iata: parsed.data.code_iata,
		code_icao: parsed.data.code_icao,
		name: parsed.data.name,
		timezone: parsed.data.timezone
	};
}

async function lookupScheduledFlights(
	apiKey: string,
	normalizedNumber: string,
	departureDate: string,
	fetcher: typeof fetch
): Promise<FlightLookupCandidate[]> {
	const parts = flightNumberParts(normalizedNumber);
	if (!parts) return [];
	const url = new URL(
		`https://aeroapi.flightaware.com/aeroapi/schedules/${departureDate}/${nextDate(departureDate)}`
	);
	url.searchParams.set('airline', parts.airline);
	url.searchParams.set('flight_number', parts.number);
	url.searchParams.set('include_codeshares', 'false');
	url.searchParams.set('max_pages', '1');
	const parsed = scheduleResponseSchema.safeParse(await flightAwareJson(apiKey, url, fetcher));
	if (!parsed.success) throw new Error('INVALID_FLIGHTAWARE_SCHEDULE_RESPONSE');
	const scheduled = parsed.data.scheduled.filter((flight) =>
		[flight.ident, flight.ident_iata, flight.ident_icao]
			.filter((ident): ident is string => Boolean(ident))
			.some((ident) => ident.replaceAll(/\s+/g, '').toUpperCase() === normalizedNumber)
	);
	const airports = new Map<string, z.infer<typeof airportSchema>>();
	await Promise.all(
		[
			...new Set(
				scheduled.flatMap((flight) => [
					flight.origin_icao || flight.origin,
					flight.destination_icao || flight.destination
				])
			)
		].map(async (code): Promise<void> => {
			airports.set(code, await airportDetails(apiKey, code, fetcher));
		})
	);
	return scheduled.map((flight) => {
		const originCode = flight.origin_icao || flight.origin;
		const destinationCode = flight.destination_icao || flight.destination;
		const origin = airports.get(originCode);
		const destination = airports.get(destinationCode);
		if (!origin || !destination) throw new Error('MISSING_FLIGHTAWARE_AIRPORT');
		return {
			providerFlightId: flight.fa_flight_id || `schedule:${flight.ident}:${flight.scheduled_out}`,
			flightNumber: flight.ident_iata || flight.ident_icao || flight.ident,
			operator: parts.airline,
			status: 'planned' as const,
			from: endpoint(origin, flight.scheduled_out, '', ''),
			to: endpoint(destination, flight.scheduled_in, '', ''),
			scheduledFrom: flight.scheduled_out,
			scheduledTo: flight.scheduled_in
		};
	});
}

export async function lookupFlightAwareFlights(
	apiKey: string,
	flightNumber: string,
	departureDate: string,
	fetcher: typeof fetch = fetch
): Promise<FlightLookupCandidate[]> {
	const normalizedNumber = flightNumber.replaceAll(/\s+/g, '').toUpperCase();
	const date = new Date(`${departureDate}T00:00:00.000Z`);
	if (!normalizedNumber || Number.isNaN(date.getTime())) throw new Error('INVALID_FLIGHT_LOOKUP');
	const start = new Date(date.getTime() - 12 * 60 * 60_000).toISOString();
	const end = new Date(date.getTime() + 36 * 60 * 60_000).toISOString();
	const url = new URL(
		`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(normalizedNumber)}`
	);
	url.searchParams.set('start', start);
	url.searchParams.set('end', end);
	url.searchParams.set('max_pages', '1');
	let body: unknown;
	try {
		body = await flightAwareJson(apiKey, url, fetcher);
	} catch (error) {
		if (futureWindowError(error)) {
			return lookupScheduledFlights(apiKey, normalizedNumber, departureDate, fetcher);
		}
		throw error;
	}
	const parsed = responseSchema.safeParse(body);
	if (!parsed.success) throw new Error('INVALID_FLIGHTAWARE_RESPONSE');
	return parsed.data.flights.flatMap((flight): FlightLookupCandidate[] => {
		const scheduledFrom = flight.scheduled_out;
		const scheduledTo = flight.scheduled_in;
		if (!scheduledFrom || !scheduledTo) return [];
		const effectiveFrom = flight.actual_out || flight.estimated_out || scheduledFrom;
		const effectiveTo = flight.actual_in || flight.estimated_in || scheduledTo;
		const candidate = {
			providerFlightId: flight.fa_flight_id,
			flightNumber: flight.ident_iata || flight.ident || normalizedNumber,
			operator: flight.operator_iata || flight.operator || '',
			status: flightStatus(flight),
			from: endpoint(flight.origin, effectiveFrom, flight.terminal_origin, flight.gate_origin),
			to: endpoint(
				flight.destination,
				effectiveTo,
				flight.terminal_destination,
				flight.gate_destination
			),
			scheduledFrom,
			scheduledTo
		};
		return candidate.from.localDateTime.startsWith(departureDate) ? [candidate] : [];
	});
}
