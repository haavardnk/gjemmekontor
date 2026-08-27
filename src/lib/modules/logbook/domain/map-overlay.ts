import type { Feature, LineString } from 'geojson';

import type { JsonValue } from '$lib/client/database';
import type { MapFeature } from '$lib/modules/map/public';
import type { TripDay } from '$lib/trip/itinerary';

import { logbookLegs } from './logbook';

export type ActualRouteProperties = {
	dayIndex: number;
	legKey: string;
	gpxId: string;
	segmentIndex: number;
};

export type ActualRouteFeature = Feature<LineString, ActualRouteProperties>;

export function layerDayNumbers(name: string): number[] {
	const match = name.match(/^Dag (\d+)(?: og (\d+))?/);
	if (!match) {
		return [];
	}
	const first = Number(match[1]);
	const last = match[2] ? Number(match[2]) : first;
	return Array.from({ length: last - first + 1 }, (_value, index) => first + index);
}

export function actualRouteFeatures(
	values: Record<string, JsonValue>,
	days: readonly TripDay[]
): ActualRouteFeature[] {
	return days.flatMap((day) =>
		logbookLegs(values, day.id).flatMap((leg) =>
			(leg.gpx?.segments ?? []).map((segment, segmentIndex): ActualRouteFeature => ({
				type: 'Feature',
				id: `${leg.gpx?.id}:${segmentIndex}`,
				geometry: { type: 'LineString', coordinates: segment },
				properties: {
					dayIndex: day.index,
					legKey: leg.key,
					gpxId: leg.gpx?.id ?? '',
					segmentIndex
				}
			}))
		)
	);
}

export function completedDayNumbers(routes: ActualRouteFeature[]): Set<number> {
	return new Set(routes.map((route) => route.properties.dayIndex + 1));
}

export function loggedNauticalMiles(
	values: Record<string, JsonValue>,
	days: readonly TripDay[]
): number {
	return days.reduce(
		(total, day) =>
			total +
			logbookLegs(values, day.id).reduce(
				(dayTotal, leg) => dayTotal + (leg.gpx?.nauticalMiles ?? 0),
				0
			),
		0
	);
}

export function hiddenPlannedRouteIds(
	features: MapFeature[],
	completedDays: Set<number>
): Set<string> {
	return new Set(
		features
			.filter((feature) => feature.geometry.type === 'LineString')
			.filter((feature) =>
				layerDayNumbers(feature.properties.layerName).some((day) => completedDays.has(day))
			)
			.map((feature) => feature.id)
	);
}

export function visibleActualRoutes(
	routes: ActualRouteFeature[],
	selectedDayIndex: number,
	currentDayOnly: boolean
): ActualRouteFeature[] {
	if (!currentDayOnly) {
		return routes;
	}
	return routes.filter((route) => route.properties.dayIndex === selectedDayIndex);
}
