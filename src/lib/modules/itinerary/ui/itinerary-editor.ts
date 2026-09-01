import type {
	EditableItineraryEndpoint,
	ItineraryEndpoint,
	Journey,
	KeyedItineraryItem,
	TransportMode
} from '../domain/itinerary';

export type TransportEntryType =
	'taxi' | 'train' | 'bus' | 'ferry' | 'transfer' | 'other-transport';

export type ItineraryEntryType =
	'flight' | TransportEntryType | 'stay' | 'rental' | 'booking' | 'note';

export interface ItineraryEditorControls {
	openNew: (type: ItineraryEntryType) => void;
	openEdit: (item: KeyedItineraryItem) => void;
	openReturn: (item: KeyedItineraryItem & Journey) => void;
}

export interface EditableItineraryLeg {
	id: string;
	mode: TransportMode;
	operator: string;
	serviceNumber: string;
	from: EditableItineraryEndpoint;
	to: EditableItineraryEndpoint;
	status: 'planned' | 'delayed' | 'cancelled' | 'completed';
	notes: string;
	provider?: Journey['legs'][number]['provider'];
}

export interface FlightCandidate {
	providerFlightId: string;
	flightNumber: string;
	operator: string;
	status: EditableItineraryLeg['status'];
	from: ItineraryEndpoint;
	to: ItineraryEndpoint;
	scheduledFrom: string;
	scheduledTo: string;
}
