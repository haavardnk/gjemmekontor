import { z } from 'zod';

import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import { getItineraryRuntimeConfig } from './server/config';
import { FlightAwareProviderError, lookupFlightAwareFlights } from './server/flightaware';

const flightLookupSchema = z
	.object({
		flightNumber: z.string().trim().min(2).max(30),
		departureDate: z.iso.date()
	})
	.strict();

export async function handleFlightLookup(request: Request): Promise<Response> {
	const parsed = await parseJsonRequest(request, flightLookupSchema);
	if (!parsed.success) return apiError('INVALID_FLIGHT_LOOKUP', 400);
	const apiKey = getItineraryRuntimeConfig().flightAwareApiKey;
	if (!apiKey) return apiError('FLIGHT_LOOKUP_NOT_CONFIGURED', 503);
	try {
		return apiSuccess({
			provider: 'flightaware' as const,
			candidates: await lookupFlightAwareFlights(
				apiKey,
				parsed.data.flightNumber,
				parsed.data.departureDate
			)
		});
	} catch (error) {
		if (error instanceof FlightAwareProviderError) {
			if (error.status === 401 || error.status === 403) {
				return apiError('FLIGHT_LOOKUP_AUTH_FAILED', 502);
			}
			if (error.status === 429) return apiError('FLIGHT_LOOKUP_RATE_LIMITED', 429);
			if (error.status === 400) return apiError('FLIGHT_LOOKUP_DATE_UNAVAILABLE', 422);
		}
		return apiError('FLIGHT_LOOKUP_FAILED', 502);
	}
}
