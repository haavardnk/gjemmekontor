import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';

import {
	instantToLocalDateTime,
	type ItineraryEndpoint,
	itineraryItemKey,
	itineraryItems,
	type Journey,
	localDateTimeToInstant,
	serializeItineraryItem,
	timelineEvents
} from './itinerary';

function endpoint(
	locationName: string,
	locationCode: string,
	localDateTime: string,
	timeZone = 'Europe/Oslo'
): ItineraryEndpoint {
	return {
		locationName,
		locationCode,
		localDateTime,
		timeZone,
		instant: localDateTimeToInstant(localDateTime, timeZone),
		terminal: '',
		gate: '',
		platform: ''
	};
}

function journey(): Journey {
	return {
		id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
		kind: 'journey',
		groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
		direction: 'one-way',
		title: 'Oslo til Bangkok',
		bookingReference: 'ABC123',
		bookingUrl: '',
		participants: ['Ada'],
		notes: '',
		version: 1,
		createdAt: '2026-08-29T10:00:00.000Z',
		createdBy: 'client-a',
		updatedAt: '2026-08-29T10:00:00.000Z',
		tombstone: false,
		legs: [
			{
				id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
				mode: 'flight',
				operator: 'SAS',
				serviceNumber: 'SK1461',
				from: endpoint('Oslo lufthavn', 'OSL', '2027-06-01T08:00'),
				to: endpoint('København', 'CPH', '2027-06-01T09:10', 'Europe/Copenhagen'),
				status: 'planned',
				notes: ''
			},
			{
				id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
				mode: 'flight',
				operator: 'SAS',
				serviceNumber: 'SK973',
				from: endpoint('København', 'CPH', '2027-06-01T10:45', 'Europe/Copenhagen'),
				to: endpoint('Bangkok', 'BKK', '2027-06-02T05:55', 'Asia/Bangkok'),
				status: 'planned',
				notes: ''
			}
		]
	};
}

describe('itinerary domain', (): void => {
	test('projects one timeline point per journey leg and keeps connection time', (): void => {
		const item = journey();
		const events = timelineEvents([{ key: itineraryItemKey(item.id), ...item }]);

		expect(events.map((event) => event.type)).toEqual(['journey-leg', 'journey-leg']);
		expect(events[1]).toMatchObject({
			label: 'SAS · SK973',
			connectionMinutes: 95,
			detail: 'København (CPH) → Bangkok (BKK)',
			mode: 'flight'
		});
	});

	test('does not show a connection duration when the next leg changes location', (): void => {
		const item = journey();
		item.legs[1]!.from = endpoint('København H', 'CPH-H', '2027-06-01T10:45');

		const events = timelineEvents([{ key: itineraryItemKey(item.id), ...item }]);
		expect(events).toHaveLength(2);
		expect(events[1]?.connectionMinutes).toBeUndefined();
	});

	test('projects paired accommodation events from one saved item', (): void => {
		const item = {
			id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
			kind: 'stay' as const,
			subtype: 'hotel' as const,
			title: 'Hotel Norge',
			bookingReference: '',
			bookingUrl: '',
			participants: [],
			notes: '',
			checkIn: endpoint('Hotel Norge', '', '2027-06-01T15:00'),
			checkOut: endpoint('Hotel Norge', '', '2027-06-03T11:00'),
			version: 1 as const,
			createdAt: '2026-08-29T10:00:00.000Z',
			createdBy: 'client-a',
			updatedAt: '2026-08-29T10:00:00.000Z',
			tombstone: false
		};

		expect(
			timelineEvents([{ key: itineraryItemKey(item.id), ...item }]).map((event) => event.type)
		).toEqual(['check-in', 'check-out']);
	});

	test('round-trips local date-times through UTC across time zones', (): void => {
		for (const [localDateTime, timeZone] of [
			['2026-01-15T08:30', 'Europe/Oslo'],
			['2026-08-15T08:30', 'Europe/Oslo'],
			['2027-06-02T05:55', 'Asia/Bangkok']
		] as const) {
			const instant = localDateTimeToInstant(localDateTime, timeZone);
			expect(instantToLocalDateTime(instant, timeZone)).toBe(localDateTime);
		}
	});

	test('loads valid records and excludes tombstones or malformed values', (): void => {
		const active = journey();
		const deleted = { ...journey(), id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', tombstone: true };
		const values: Record<string, JsonValue> = {
			[itineraryItemKey(active.id)]: serializeItineraryItem(active),
			[itineraryItemKey(deleted.id)]: serializeItineraryItem(deleted),
			'itinerary:item:broken': { kind: 'journey' }
		};

		expect(itineraryItems(values)).toHaveLength(1);
		expect(itineraryItems(values)[0]?.id).toBe(active.id);
	});
});
