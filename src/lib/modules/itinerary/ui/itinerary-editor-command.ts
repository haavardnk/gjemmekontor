import type { SharedStateWrite } from '$lib/client/state.svelte';

import {
	bookingSchema,
	type EditableItineraryEndpoint,
	itineraryItemKey,
	type Journey,
	journeySchema,
	journeyTitle,
	type KeyedItineraryItem,
	noteSchema,
	rentalSchema,
	serializeItineraryItem,
	staySchema
} from '../domain/itinerary';
import type { EditableItineraryLeg, ItineraryEntryType } from './itinerary-editor';
import { endpointWithInstant, isTransportEntry, transportModeFor } from './itinerary-editor-model';

export type ItineraryEditorDraft = {
	entryType: ItineraryEntryType;
	itemId: string;
	editingKey?: string;
	title: string;
	bookingReference: string;
	bookingUrl: string;
	selectedParticipants: string[];
	notes: string;
	createdAt: string;
	createdBy: string;
	journeyGroupId: string;
	journeyDirection: 'one-way' | 'outbound' | 'return';
	legs: EditableItineraryLeg[];
	staySubtype: 'hotel' | 'holiday-rental' | 'camping' | 'other';
	rentalSubtype: 'car' | 'boat' | 'bike' | 'equipment' | 'other';
	bookingSubtype: 'activity' | 'restaurant' | 'event' | 'appointment' | 'other';
	primary: EditableItineraryEndpoint;
	secondary: EditableItineraryEndpoint;
	bookingHasEnd: boolean;
	returnSource?: KeyedItineraryItem & Journey;
};

export type ItineraryWriteResult =
	{ success: true; writes: SharedStateWrite[] } | { success: false; error: string };

export function buildItineraryWrites(
	draft: ItineraryEditorDraft,
	identity: { now: string; actor: string }
): ItineraryWriteResult {
	const normalizedLegs = draft.legs.map((leg) => {
		const from = endpointWithInstant(leg.from);
		const hidesArrival = draft.entryType === 'taxi' || draft.entryType === 'transfer';
		return {
			...leg,
			mode:
				draft.entryType === 'flight'
					? ('flight' as const)
					: isTransportEntry(draft.entryType)
						? transportModeFor(draft.entryType)
						: leg.mode,
			operator: leg.operator.trim(),
			serviceNumber: leg.serviceNumber.trim().toUpperCase(),
			notes: leg.notes.trim(),
			from,
			to: endpointWithInstant(
				hidesArrival
					? {
							...leg.to,
							localDateTime: leg.from.localDateTime,
							timeZone: leg.from.timeZone,
							locationCode: '',
							terminal: '',
							gate: '',
							platform: ''
						}
					: leg.to
			)
		};
	});
	const common = {
		id: draft.itemId,
		title:
			draft.entryType === 'flight' || isTransportEntry(draft.entryType)
				? journeyTitle(normalizedLegs)
				: draft.title.trim(),
		bookingReference: draft.bookingReference.trim(),
		bookingUrl: draft.bookingUrl.trim(),
		participants: [...draft.selectedParticipants],
		notes: draft.notes.trim(),
		createdAt: draft.createdAt || identity.now,
		createdBy: draft.createdBy || identity.actor,
		updatedAt: identity.now,
		tombstone: false,
		version: 1 as const
	};
	let parsed;
	if (draft.entryType === 'flight' || isTransportEntry(draft.entryType)) {
		parsed = journeySchema.safeParse({
			...common,
			kind: 'journey',
			groupId: draft.journeyGroupId,
			direction: draft.journeyDirection,
			legs:
				isTransportEntry(draft.entryType) && !draft.editingKey
					? normalizedLegs.slice(0, 1)
					: normalizedLegs
		});
	} else {
		switch (draft.entryType) {
			case 'stay':
				parsed = staySchema.safeParse({
					...common,
					kind: 'stay',
					subtype: draft.staySubtype,
					checkIn: endpointWithInstant(draft.primary),
					checkOut: endpointWithInstant({
						...draft.secondary,
						locationName: draft.primary.locationName,
						locationCode: draft.primary.locationCode,
						timeZone: draft.primary.timeZone
					})
				});
				break;
			case 'rental':
				parsed = rentalSchema.safeParse({
					...common,
					kind: 'rental',
					subtype: draft.rentalSubtype,
					pickup: endpointWithInstant(draft.primary),
					return: endpointWithInstant(draft.secondary)
				});
				break;
			case 'booking':
				parsed = bookingSchema.safeParse({
					...common,
					kind: 'booking',
					subtype: draft.bookingSubtype,
					start: endpointWithInstant(draft.primary),
					...(draft.bookingHasEnd ? { end: endpointWithInstant(draft.secondary) } : {})
				});
				break;
			case 'note':
				parsed = noteSchema.safeParse({
					...common,
					kind: 'note',
					at: endpointWithInstant(draft.primary)
				});
				break;
		}
	}
	if (!parsed) return { success: false, error: 'Ukjent type reiseplanoppføring.' };
	if (!parsed.success) {
		return { success: false, error: parsed.error.issues[0]?.message ?? 'Kontroller feltene.' };
	}
	const writes: SharedStateWrite[] = [
		{
			key: draft.editingKey ?? itineraryItemKey(parsed.data.id),
			value: serializeItineraryItem(parsed.data)
		}
	];
	if (draft.returnSource && draft.returnSource.direction === 'one-way') {
		const sourceItem = Object.fromEntries(
			Object.entries(draft.returnSource).filter(([name]) => name !== 'key')
		);
		writes.unshift({
			key: draft.returnSource.key,
			value: serializeItineraryItem(
				journeySchema.parse({
					...sourceItem,
					direction: 'outbound',
					updatedAt: identity.now
				})
			)
		});
	}
	return { success: true, writes };
}
