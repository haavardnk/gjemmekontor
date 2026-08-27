import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';
import type { MapFeature } from '$lib/modules/map/public';
import { tripDays } from '$lib/trip/itinerary';

import { type LogbookLeg, logbookLegKey, serializeLogbookLeg } from './logbook';
import {
	actualRouteFeatures,
	completedDayNumbers,
	hiddenPlannedRouteIds,
	layerDayNumbers,
	loggedNauticalMiles,
	visibleActualRoutes
} from './map-overlay';

const leg: LogbookLeg = {
	from: { kind: 'text', name: 'A' },
	to: { kind: 'text', name: 'B' },
	departure: '10:00',
	arrival: '11:00',
	nauticalMiles: 4,
	sailingMinutes: 30,
	engineMinutes: 30,
	mooring: 'anchor',
	customMooring: '',
	gpx: {
		id: '019d0d25-8ea0-7000-8000-000000000001',
		filename: 'orca.gpx',
		checksum: 'a'.repeat(64),
		byteSize: 100,
		version: 1,
		name: 'Tur',
		departureAt: '2026-09-05T08:00:00.000Z',
		arrivalAt: '2026-09-05T09:00:00.000Z',
		nauticalMiles: 4,
		activeSeconds: 3_000,
		elapsedSeconds: 3_600,
		stationarySeconds: 600,
		originalPointCount: 100,
		routePointCount: 4,
		segments: [
			[
				[16, 43],
				[16.1, 43.1]
			],
			[
				[16.2, 43.2],
				[16.3, 43.3]
			]
		],
		stationaryBlocks: [],
		recordingGaps: []
	},
	createdAt: '2026-09-05T10:00:00.000Z',
	createdBy: 'client-a',
	tombstone: false
};

function plannedFeature(id: string, layerName: string): MapFeature {
	return {
		type: 'Feature',
		id,
		geometry: {
			type: 'LineString',
			coordinates: [
				[16, 43],
				[16.1, 43.1]
			]
		},
		properties: {
			title: id,
			description: '',
			snippet: '',
			address: '',
			layerId: id,
			layerName,
			layerPath: [layerName],
			extendedData: {},
			style: {}
		}
	};
}

describe('trip routes', (): void => {
	test('maps every trip date to the Google day folders', (): void => {
		const folderNames = [
			'Dag 1 - Lørdag',
			'Dag 2 og 3 - Søndag og Mandag - Hvar Vest',
			'Dag 4 og 5 - Tirsdag og Onsdag - Vis',
			'Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo',
			'Dag 8 og 9 - Lørdag og Søndag',
			'Dag 10 og 11 - Mandag og Tirsdag',
			'Dag 12 og 13 - Onsdag og Torsdag',
			'Dag 14 - Fredag'
		];
		const assignments = Object.fromEntries(
			tripDays.map((day) => [
				day.date,
				folderNames.filter((name) => layerDayNumbers(name).includes(day.index + 1))
			])
		);

		expect(assignments).toEqual({
			'2026-09-05': ['Dag 1 - Lørdag'],
			'2026-09-06': ['Dag 2 og 3 - Søndag og Mandag - Hvar Vest'],
			'2026-09-07': ['Dag 2 og 3 - Søndag og Mandag - Hvar Vest'],
			'2026-09-08': ['Dag 4 og 5 - Tirsdag og Onsdag - Vis'],
			'2026-09-09': ['Dag 4 og 5 - Tirsdag og Onsdag - Vis'],
			'2026-09-10': ['Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo'],
			'2026-09-11': ['Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo'],
			'2026-09-12': ['Dag 8 og 9 - Lørdag og Søndag'],
			'2026-09-13': ['Dag 8 og 9 - Lørdag og Søndag'],
			'2026-09-14': ['Dag 10 og 11 - Mandag og Tirsdag'],
			'2026-09-15': ['Dag 10 og 11 - Mandag og Tirsdag'],
			'2026-09-16': ['Dag 12 og 13 - Onsdag og Torsdag'],
			'2026-09-17': ['Dag 12 og 13 - Onsdag og Torsdag'],
			'2026-09-18': ['Dag 14 - Fredag'],
			'2026-09-19': [],
			'2026-09-20': [],
			'2026-09-21': [],
			'2026-09-22': [],
			'2026-09-23': []
		});
	});

	test('emits each GPX segment independently and ignores legacy legs', (): void => {
		const values: Record<string, JsonValue> = {
			[logbookLegKey(tripDays[0].id, 'gpx')]: serializeLogbookLeg(leg),
			[logbookLegKey(tripDays[0].id, 'legacy')]: serializeLogbookLeg({ ...leg, gpx: undefined })
		};
		const routes = actualRouteFeatures(values, tripDays);

		expect(routes).toHaveLength(2);
		expect(routes.map((route) => route.geometry.coordinates)).toEqual(leg.gpx?.segments);
		expect(completedDayNumbers(routes)).toEqual(new Set([1]));
		expect(loggedNauticalMiles(values, tripDays)).toBe(4);
	});

	test('hides planned routes when any represented day is complete', (): void => {
		const features = [
			plannedFeature('day-one', 'Dag 1 - Lørdag'),
			plannedFeature('combined', 'Dag 8 og 9 - Helg'),
			plannedFeature('future', 'Dag 10 og 11 - Senere')
		];

		expect(hiddenPlannedRouteIds(features, new Set([1, 8]))).toEqual(
			new Set(['day-one', 'combined'])
		);
		expect(layerDayNumbers('Dag 8 og 9 - Helg')).toEqual([8, 9]);
	});

	test('shows all actual routes or only the selected trip day', (): void => {
		const values: Record<string, JsonValue> = {
			[logbookLegKey(tripDays[0].id, 'day-one')]: serializeLogbookLeg(leg),
			[logbookLegKey(tripDays[1].id, 'day-two')]: serializeLogbookLeg({
				...leg,
				gpx: leg.gpx ? { ...leg.gpx, id: '019d0d25-8ea0-7000-8000-000000000002' } : undefined
			})
		};
		const routes = actualRouteFeatures(values, tripDays);

		expect(visibleActualRoutes(routes, 0, false)).toHaveLength(4);
		expect(visibleActualRoutes(routes, 1, true)).toHaveLength(2);
		expect(visibleActualRoutes(routes, 1, true)[0]?.properties.dayIndex).toBe(1);
	});

	test('uses the supplied trip calendar instead of the Kroatia day range', (): void => {
		const customDay = {
			id: 'custom-day-id',
			index: 25,
			date: '2027-01-26',
			dateLabel: 'Dag 26',
			title: 'Ekstra dag',
			phase: 'Reise'
		};
		const values: Record<string, JsonValue> = {
			[logbookLegKey(customDay.id, 'custom')]: serializeLogbookLeg(leg)
		};

		expect(actualRouteFeatures(values, [customDay])).toHaveLength(2);
		expect(loggedNauticalMiles(values, [customDay])).toBe(4);
		expect(actualRouteFeatures(values, tripDays)).toHaveLength(0);
	});
});
