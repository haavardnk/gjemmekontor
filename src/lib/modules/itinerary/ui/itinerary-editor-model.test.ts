import { describe, expect, test } from 'vitest';

import { ApiError } from '$lib/client/api';

import type { KeyedItineraryItem } from '../domain/itinerary';
import {
	createItineraryEditorModel,
	endpointWithInstant,
	entryTypeForItem,
	flightLookupError,
	minutesOnDate
} from './itinerary-editor-model';

describe('itinerary editor model', (): void => {
	test('uses current trip defaults for newly created endpoints', (): void => {
		let defaults = { date: '2027-06-01', timeZone: 'Europe/Oslo' };
		const model = createItineraryEditorModel(() => defaults);

		expect(model.blankEndpoint()).toMatchObject({
			localDateTime: '2027-06-01T09:00',
			timeZone: 'Europe/Oslo'
		});
		defaults = { date: '2027-06-02', timeZone: 'Asia/Bangkok' };
		expect(model.blankEndpoint('', '', '12:30')).toMatchObject({
			localDateTime: '2027-06-02T12:30',
			timeZone: 'Asia/Bangkok'
		});
	});

	test('normalizes an endpoint and derives its instant', (): void => {
		expect(
			endpointWithInstant({
				locationName: ' Oslo ',
				locationCode: ' osl ',
				localDateTime: '2027-06-01T09:00',
				timeZone: ' Europe/Oslo ',
				terminal: ' 2 ',
				gate: ' A1 ',
				platform: ' '
			})
		).toEqual({
			locationName: 'Oslo',
			locationCode: 'OSL',
			localDateTime: '2027-06-01T09:00',
			timeZone: 'Europe/Oslo',
			instant: '2027-06-01T07:00:00.000Z',
			terminal: '2',
			gate: 'A1',
			platform: ''
		});
	});

	test('classifies journeys and maps dates and provider errors', (): void => {
		const journey = {
			kind: 'journey',
			legs: [{ mode: 'ferry' }]
		} as KeyedItineraryItem;
		expect(entryTypeForItem(journey)).toBe('ferry');
		expect(minutesOnDate('2027-06-01', 9 * 60 + 30)).toBe('2027-06-01T09:30');
		expect(flightLookupError(new ApiError('FLIGHT_LOOKUP_RATE_LIMITED', 429))).toContain(
			'begrenser'
		);
		expect(flightLookupError(new Error('offline'))).toContain('svarte ikke');
	});
});
