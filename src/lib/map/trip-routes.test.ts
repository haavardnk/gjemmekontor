import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';
import type { MapFeature } from '$lib/map/types';
import { type LogbookLeg, logbookLegKey, serializeLogbookLeg } from '$lib/trip/logbook';

import {
	actualRouteFeatures,
	completedDayNumbers,
	hiddenPlannedRouteIds,
	layerDayNumbers,
	loggedNauticalMiles,
	visibleActualRoutes
} from './trip-routes';

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
	test('emits each GPX segment independently and ignores legacy legs', (): void => {
		const values: Record<string, JsonValue> = {
			[logbookLegKey(0, 'gpx')]: serializeLogbookLeg(leg),
			[logbookLegKey(0, 'legacy')]: serializeLogbookLeg({ ...leg, gpx: undefined })
		};
		const routes = actualRouteFeatures(values);

		expect(routes).toHaveLength(2);
		expect(routes.map((route) => route.geometry.coordinates)).toEqual(leg.gpx?.segments);
		expect(completedDayNumbers(routes)).toEqual(new Set([1]));
		expect(loggedNauticalMiles(values)).toBe(4);
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
			[logbookLegKey(0, 'day-one')]: serializeLogbookLeg(leg),
			[logbookLegKey(1, 'day-two')]: serializeLogbookLeg({
				...leg,
				gpx: leg.gpx ? { ...leg.gpx, id: '019d0d25-8ea0-7000-8000-000000000002' } : undefined
			})
		};
		const routes = actualRouteFeatures(values);

		expect(visibleActualRoutes(routes, 0, false)).toHaveLength(4);
		expect(visibleActualRoutes(routes, 1, true)).toHaveLength(2);
		expect(visibleActualRoutes(routes, 1, true)[0]?.properties.dayIndex).toBe(1);
	});
});
