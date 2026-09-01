import { ApiError } from '$lib/client/api';

import {
	type EditableItineraryEndpoint,
	instantToLocalDateTime,
	type ItineraryEndpoint,
	type KeyedItineraryItem,
	localDateTimeToInstant,
	type TransportMode
} from '../domain/itinerary';
import type {
	EditableItineraryLeg,
	ItineraryEntryType,
	TransportEntryType
} from './itinerary-editor';

export const transportEntryTypes: readonly TransportEntryType[] = [
	'taxi',
	'train',
	'bus',
	'ferry',
	'transfer',
	'other-transport'
];

export function entryTypeForItem(item: KeyedItineraryItem): ItineraryEntryType {
	if (item.kind !== 'journey') return item.kind;
	if (item.legs.every((leg) => leg.mode === 'flight')) return 'flight';
	const mode = item.legs[0]?.mode;
	return mode === 'taxi' ||
		mode === 'train' ||
		mode === 'bus' ||
		mode === 'ferry' ||
		mode === 'transfer'
		? mode
		: 'other-transport';
}

export function isTransportEntry(value: ItineraryEntryType): value is TransportEntryType {
	return transportEntryTypes.includes(value as TransportEntryType);
}

export function transportModeFor(value: TransportEntryType): TransportMode {
	return value === 'other-transport' ? 'other' : value;
}

export function editableEndpoint(endpoint: ItineraryEndpoint): EditableItineraryEndpoint {
	return {
		locationName: endpoint.locationName,
		locationCode: endpoint.locationCode,
		localDateTime: endpoint.localDateTime,
		timeZone: endpoint.timeZone,
		terminal: endpoint.terminal,
		gate: endpoint.gate,
		platform: endpoint.platform
	};
}

export function endpointWithInstant(endpoint: EditableItineraryEndpoint): ItineraryEndpoint {
	return {
		...endpoint,
		locationName: endpoint.locationName.trim(),
		locationCode: endpoint.locationCode.trim().toUpperCase(),
		timeZone: endpoint.timeZone.trim(),
		instant: localDateTimeToInstant(endpoint.localDateTime, endpoint.timeZone.trim()),
		terminal: endpoint.terminal.trim(),
		gate: endpoint.gate.trim(),
		platform: endpoint.platform.trim()
	};
}

export function createItineraryEditorModel(defaults: () => { date: string; timeZone: string }) {
	function blankEndpoint(
		locationName = '',
		locationCode = '',
		time = '09:00',
		date = defaults().date,
		zone = defaults().timeZone
	): EditableItineraryEndpoint {
		return {
			locationName,
			locationCode,
			localDateTime: `${date}T${time}`,
			timeZone: zone,
			terminal: '',
			gate: '',
			platform: ''
		};
	}

	function blankLeg(mode: TransportMode, from?: EditableItineraryEndpoint): EditableItineraryLeg {
		const departure = from ? { ...from } : blankEndpoint();
		const departureInstant = localDateTimeToInstant(departure.localDateTime, departure.timeZone);
		const arrivalInstant = new Date(new Date(departureInstant).getTime() + 2 * 60 * 60_000);
		const localArrival = instantToLocalDateTime(arrivalInstant.toISOString(), departure.timeZone);
		return {
			id: crypto.randomUUID(),
			mode,
			operator: '',
			serviceNumber: '',
			from: departure,
			to: blankEndpoint(
				'',
				'',
				localArrival.slice(11),
				localArrival.slice(0, 10),
				departure.timeZone
			),
			status: 'planned',
			notes: ''
		};
	}

	return { blankEndpoint, blankLeg };
}

export function minutesOnDate(date: string, minutes: number): string {
	return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + minutes * 60_000)
		.toISOString()
		.slice(0, 16);
}

export function flightLookupError(error: unknown): string {
	if (!(error instanceof ApiError)) return 'Flyoppslaget svarte ikke. Fyll inn manuelt.';
	if (error.code === 'FLIGHT_LOOKUP_NOT_CONFIGURED')
		return 'Flyoppslag er ikke konfigurert. Fyll inn manuelt.';
	if (error.code === 'FLIGHT_LOOKUP_AUTH_FAILED') return 'FlightAware avviste API-nøkkelen.';
	if (error.code === 'FLIGHT_LOOKUP_RATE_LIMITED')
		return 'FlightAware begrenser oppslag. Vent litt og prøv igjen.';
	if (error.code === 'FLIGHT_LOOKUP_DATE_UNAVAILABLE')
		return 'FlightAware har ikke data for denne datoen.';
	return 'Flyoppslaget svarte ikke. Fyll inn manuelt.';
}
