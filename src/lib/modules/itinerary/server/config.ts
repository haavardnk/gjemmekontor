import { z } from 'zod';

import { env } from '$env/dynamic/private';

const optionalString = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().min(1).optional()
);

const itineraryEnvironmentSchema = z.object({
	FLIGHTAWARE_AEROAPI_KEY: optionalString
});

export type ItineraryRuntimeConfig = {
	flightAwareApiKey?: string;
};

export function parseItineraryRuntimeConfig(
	environment: Record<string, string | undefined>
): ItineraryRuntimeConfig {
	const result = itineraryEnvironmentSchema.safeParse(environment);
	if (!result.success) {
		throw new Error('Invalid Reiseplan environment: FLIGHTAWARE_AEROAPI_KEY');
	}
	return result.data.FLIGHTAWARE_AEROAPI_KEY
		? { flightAwareApiKey: result.data.FLIGHTAWARE_AEROAPI_KEY }
		: {};
}

export function getItineraryRuntimeConfig(): ItineraryRuntimeConfig {
	return parseItineraryRuntimeConfig(env);
}
