import { describe, expect, test } from 'vitest';

import { parseItineraryRuntimeConfig } from './config';

describe('itinerary runtime config', (): void => {
	test('keeps flight lookup optional', (): void => {
		expect(parseItineraryRuntimeConfig({})).toEqual({});
		expect(parseItineraryRuntimeConfig({ FLIGHTAWARE_AEROAPI_KEY: '' })).toEqual({});
	});

	test('loads a server-only FlightAware key', (): void => {
		expect(parseItineraryRuntimeConfig({ FLIGHTAWARE_AEROAPI_KEY: 'secret' })).toEqual({
			flightAwareApiKey: 'secret'
		});
	});
});
