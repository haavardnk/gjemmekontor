import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';

import {
	type LogbookLeg,
	logbookLegKey,
	logbookLegs,
	logbookLegSchema,
	logbookTotals,
	parseLocation,
	serializeLocation,
	serializeLogbookLeg
} from './logbook';

const leg: LogbookLeg = {
	from: { kind: 'text', name: 'Split' },
	to: { kind: 'map', featureId: 'poi-1', name: 'Hvar', coordinates: [16.44, 43.17] },
	departure: '09:15',
	arrival: '13:30',
	nauticalMiles: 22.4,
	sailingMinutes: 180,
	engineMinutes: 45,
	mooring: 'anchor',
	customMooring: '',
	createdAt: '2026-09-05T08:00:00.000Z',
	createdBy: 'client-a',
	tombstone: false
};

describe('Logbook', (): void => {
	test('round-trips free-text and map locations', (): void => {
		expect(parseLocation(serializeLocation(leg.from))).toEqual(leg.from);
		expect(parseLocation(serializeLocation(leg.to))).toEqual(leg.to);
	});

	test('uses independent UUID leg keys', (): void => {
		expect(logbookLegKey(3, 'row-a')).toBe('logbook:d3:leg:row-a');
	});

	test('round-trips GPX metadata while retaining legacy legs', (): void => {
		const gpxLeg: LogbookLeg = {
			...leg,
			gpx: {
				id: '019d0d25-8ea0-7000-8000-000000000001',
				filename: 'orca.gpx',
				checksum: 'a'.repeat(64),
				byteSize: 100,
				version: 1,
				name: 'Tur',
				departureAt: '2026-09-05T08:00:00.000Z',
				arrivalAt: '2026-09-05T09:00:00.000Z',
				nauticalMiles: 4.2,
				activeSeconds: 3_000,
				elapsedSeconds: 3_600,
				stationarySeconds: 600,
				originalPointCount: 100,
				routePointCount: 20,
				segments: [
					[
						[16, 43],
						[16.1, 43.1]
					]
				],
				stationaryBlocks: [],
				recordingGaps: []
			}
		};

		expect(logbookLegSchema.parse(serializeLogbookLeg(gpxLeg))).toEqual(gpxLeg);
		expect(logbookLegSchema.parse(serializeLogbookLeg(leg))).toEqual(leg);
	});

	test('sorts by departure and hides tombstones and invalid rows', (): void => {
		const earlier = { ...leg, departure: '08:30', createdAt: '2026-09-05T09:00:00.000Z' };
		const deleted = { ...leg, tombstone: true };
		const values: Record<string, JsonValue> = {
			[logbookLegKey(0, 'later')]: serializeLogbookLeg(leg),
			[logbookLegKey(0, 'earlier')]: serializeLogbookLeg(earlier),
			[logbookLegKey(0, 'deleted')]: serializeLogbookLeg(deleted),
			[logbookLegKey(1, 'other')]: serializeLogbookLeg(leg),
			'logbook:d0:leg:invalid': null
		};

		expect(logbookLegs(values, 0).map((item) => item.key)).toEqual([
			'logbook:d0:leg:earlier',
			'logbook:d0:leg:later'
		]);
	});

	test('derives daily totals without persisted aggregate state', (): void => {
		expect(logbookTotals([leg, { ...leg, nauticalMiles: 10, sailingMinutes: 0 }])).toEqual({
			nauticalMiles: 32.4,
			sailingMinutes: 180,
			engineMinutes: 90,
			legCount: 2
		});
	});
});
