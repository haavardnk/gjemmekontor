<script lang="ts">
	import { X } from '@lucide/svelte';

	import { apiRequest } from '$lib/client/api';
	import { sharedState } from '$lib/client/state.svelte';
	import type { ItineraryMember } from '$lib/modules/itinerary/server/members';

	import {
		type EditableItineraryEndpoint,
		type Journey,
		type KeyedItineraryItem
	} from '../domain/itinerary';
	import FlightEditorFields from './FlightEditorFields.svelte';
	import type {
		EditableItineraryLeg,
		FlightCandidate,
		ItineraryEditorControls,
		ItineraryEntryType
	} from './itinerary-editor';
	import { buildItineraryWrites } from './itinerary-editor-command';
	import {
		createItineraryEditorModel,
		editableEndpoint,
		entryTypeForItem,
		flightLookupError,
		isTransportEntry,
		minutesOnDate,
		transportModeFor
	} from './itinerary-editor-model';
	import ItineraryEditorDetails from './ItineraryEditorDetails.svelte';
	import PlanEditorFields from './PlanEditorFields.svelte';
	import TransportEditorFields from './TransportEditorFields.svelte';

	let {
		members,
		googlePlacesApiKey,
		online,
		defaultDate,
		finalDate,
		timeZone,
		onready
	}: {
		members: ItineraryMember[];
		googlePlacesApiKey: string;
		online: boolean;
		defaultDate: string;
		finalDate: string;
		timeZone: string;
		onready: (controls: ItineraryEditorControls) => void;
	} = $props();

	const { blankEndpoint, blankLeg } = createItineraryEditorModel(() => ({
		date: defaultDate,
		timeZone
	}));
	const entryLabels: Record<ItineraryEntryType, string> = {
		flight: 'Fly',
		taxi: 'Transport',
		train: 'Transport',
		bus: 'Transport',
		ferry: 'Transport',
		transfer: 'Transport',
		'other-transport': 'Transport',
		stay: 'Overnatting',
		rental: 'Leie',
		booking: 'Bestilling',
		note: 'Påminnelse'
	};

	let editorOpen = $state(false);
	let editingKey = $state<string>();
	let entryType = $state<ItineraryEntryType>('flight');
	let itemId = $state('');
	let title = $state('');
	let bookingReference = $state('');
	let bookingUrl = $state('');
	let selectedParticipants = $state<string[]>([]);
	let notes = $state('');
	let createdAt = $state('');
	let createdBy = $state('');
	let journeyGroupId = $state('');
	let journeyDirection = $state<'one-way' | 'outbound' | 'return'>('one-way');
	let legs = $state<EditableItineraryLeg[]>([]);
	let manualLegIds = $state<string[]>([]);
	let staySubtype = $state<'hotel' | 'holiday-rental' | 'camping' | 'other'>('hotel');
	let rentalSubtype = $state<'car' | 'boat' | 'bike' | 'equipment' | 'other'>('car');
	let bookingSubtype = $state<'activity' | 'restaurant' | 'event' | 'appointment' | 'other'>(
		'activity'
	);
	let primary = $state<EditableItineraryEndpoint>(blankEndpoint('', '', '09:00'));
	let secondary = $state<EditableItineraryEndpoint>(blankEndpoint('', '', '10:00'));
	let bookingHasEnd = $state(false);
	let returnSource = $state<KeyedItineraryItem & Journey>();
	let formError = $state('');
	let saving = $state(false);
	let lookupLegId = $state<string>();
	let lookupCandidates = $state<FlightCandidate[]>([]);
	let lookupLoading = $state(false);
	let lookupError = $state('');
	let lookupController: AbortController | undefined;

	function editorLabel(value: ItineraryEntryType): string {
		return entryLabels[value];
	}

	function resetEditor(type: ItineraryEntryType): void {
		lookupController?.abort();
		lookupController = undefined;
		entryType = type;
		itemId = crypto.randomUUID();
		editingKey = undefined;
		title = '';
		bookingReference = '';
		bookingUrl = '';
		selectedParticipants = members.map((member) => member.name);
		notes = '';
		createdAt = '';
		createdBy = '';
		journeyGroupId = itemId;
		journeyDirection = 'one-way';
		legs = [
			blankLeg(
				type === 'flight' ? 'flight' : isTransportEntry(type) ? transportModeFor(type) : 'train'
			)
		];
		manualLegIds = [];
		staySubtype = 'hotel';
		rentalSubtype = 'car';
		bookingSubtype = 'activity';
		primary = blankEndpoint('', '', '09:00');
		secondary = blankEndpoint('', '', '10:00');
		bookingHasEnd = false;
		returnSource = undefined;
		formError = '';
		lookupLegId = undefined;
		lookupCandidates = [];
		lookupLoading = false;
		lookupError = '';
	}

	function openNew(type: ItineraryEntryType): void {
		resetEditor(type);
		editorOpen = true;
	}

	function openEdit(item: KeyedItineraryItem): void {
		resetEditor(entryTypeForItem(item));
		editingKey = item.key;
		itemId = item.id;
		title = item.title;
		bookingReference = item.bookingReference;
		bookingUrl = item.bookingUrl;
		selectedParticipants = [...item.participants];
		notes = item.notes;
		createdAt = item.createdAt;
		createdBy = item.createdBy;
		switch (item.kind) {
			case 'journey':
				journeyGroupId = item.groupId;
				journeyDirection = item.direction;
				legs = item.legs.map((leg) => ({
					...leg,
					from: editableEndpoint(leg.from),
					to: editableEndpoint(leg.to)
				}));
				manualLegIds = [];
				break;
			case 'stay':
				staySubtype = item.subtype;
				primary = editableEndpoint(item.checkIn);
				secondary = editableEndpoint(item.checkOut);
				break;
			case 'rental':
				rentalSubtype = item.subtype;
				primary = editableEndpoint(item.pickup);
				secondary = editableEndpoint(item.return);
				break;
			case 'booking':
				bookingSubtype = item.subtype;
				primary = editableEndpoint(item.start);
				bookingHasEnd = Boolean(item.end);
				secondary = item.end ? editableEndpoint(item.end) : blankEndpoint('', '', '10:00');
				break;
			case 'note':
				primary = editableEndpoint(item.at);
				break;
		}
		editorOpen = true;
	}

	function openReturn(item: KeyedItineraryItem & Journey): void {
		resetEditor(entryTypeForItem(item));
		returnSource = item;
		journeyGroupId = item.groupId;
		journeyDirection = 'return';
		bookingReference = item.bookingReference;
		bookingUrl = item.bookingUrl;
		selectedParticipants = [...item.participants];
		legs = [...item.legs].reverse().map((leg, index) => ({
			id: crypto.randomUUID(),
			mode: leg.mode,
			operator: leg.operator,
			serviceNumber: '',
			from: {
				...editableEndpoint(leg.to),
				localDateTime: minutesOnDate(finalDate, 9 * 60 + index * 180)
			},
			to: {
				...editableEndpoint(leg.from),
				localDateTime: minutesOnDate(finalDate, 11 * 60 + index * 180)
			},
			status: 'planned',
			notes: ''
		}));
		manualLegIds = [];
		editorOpen = true;
	}

	function addFlightLeg(): void {
		const previous = legs.at(-1);
		const leg = blankLeg('flight', previous ? { ...previous.to } : undefined);
		legs.push(leg);
	}

	function removeLeg(index: number): void {
		if (legs.length <= 1) return;
		const [removed] = legs.splice(index, 1);
		if (removed) manualLegIds = manualLegIds.filter((id) => id !== removed.id);
	}

	function toggleManualLeg(legId: string): void {
		if (!manualLegIds.includes(legId) && lookupLegId === legId) {
			lookupController?.abort();
			lookupController = undefined;
			lookupLegId = undefined;
			lookupCandidates = [];
			lookupLoading = false;
			lookupError = '';
		}
		manualLegIds = manualLegIds.includes(legId)
			? manualLegIds.filter((id) => id !== legId)
			: [...manualLegIds, legId];
	}

	function updateDepartureDate(leg: EditableItineraryLeg, date: string): void {
		const previousDate = leg.from.localDateTime.slice(0, 10);
		leg.from.localDateTime = `${date}T${leg.from.localDateTime.slice(11)}`;
		if (leg.to.localDateTime.startsWith(previousDate)) {
			leg.to.localDateTime = `${date}T${leg.to.localDateTime.slice(11)}`;
		}
	}

	function toggleParticipant(name: string): void {
		selectedParticipants = selectedParticipants.includes(name)
			? selectedParticipants.filter((participant) => participant !== name)
			: [...selectedParticipants, name];
	}

	async function lookupFlight(leg: EditableItineraryLeg): Promise<void> {
		if (!online) {
			lookupError = 'Flydata krever nett. Du kan fylle inn detaljene manuelt.';
			lookupLegId = leg.id;
			if (!manualLegIds.includes(leg.id)) manualLegIds = [...manualLegIds, leg.id];
			return;
		}
		if (!leg.serviceNumber.trim()) {
			lookupError = 'Skriv inn flightnummer først.';
			lookupLegId = leg.id;
			return;
		}
		lookupController?.abort();
		const controller = new AbortController();
		lookupController = controller;
		lookupLegId = leg.id;
		lookupCandidates = [];
		lookupError = '';
		lookupLoading = true;
		try {
			const response = await apiRequest<{ provider: 'flightaware'; candidates: FlightCandidate[] }>(
				'/api/itinerary/flights/lookup',
				{
					method: 'POST',
					signal: controller.signal,
					json: {
						flightNumber: leg.serviceNumber.trim(),
						departureDate: leg.from.localDateTime.slice(0, 10)
					}
				}
			);
			if (lookupController !== controller) return;
			lookupCandidates = response.candidates;
			if (response.candidates.length === 0) {
				lookupError = 'Fant ingen flyvning på denne datoen.';
				if (!manualLegIds.includes(leg.id)) manualLegIds = [...manualLegIds, leg.id];
			}
			if (response.candidates.length === 1) applyFlightCandidate(response.candidates[0]!, leg.id);
		} catch (error) {
			if (controller.signal.aborted || lookupController !== controller) return;
			lookupError = flightLookupError(error);
			if (!manualLegIds.includes(leg.id)) manualLegIds = [...manualLegIds, leg.id];
		} finally {
			if (lookupController === controller) {
				lookupController = undefined;
				lookupLoading = false;
			}
		}
	}

	function applyFlightCandidate(candidate: FlightCandidate, legId: string): void {
		const leg = legs.find((entry) => entry.id === legId);
		if (!leg) return;
		leg.operator = candidate.operator;
		leg.serviceNumber = candidate.flightNumber;
		leg.status = candidate.status;
		leg.from = editableEndpoint(candidate.from);
		leg.to = editableEndpoint(candidate.to);
		leg.provider = {
			name: 'flightaware',
			flightId: candidate.providerFlightId,
			lastRefreshedAt: new Date().toISOString()
		};
		manualLegIds = manualLegIds.filter((id) => id !== leg.id);
		lookupCandidates = [];
		lookupError = '';
	}

	async function saveItem(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		saving = true;
		formError = '';
		try {
			const now = new Date().toISOString();
			const actor = createdBy || (await sharedState.clientId());
			const result = buildItineraryWrites(
				{
					entryType,
					itemId,
					...(editingKey ? { editingKey } : {}),
					title,
					bookingReference,
					bookingUrl,
					selectedParticipants,
					notes,
					createdAt,
					createdBy,
					journeyGroupId,
					journeyDirection,
					legs,
					staySubtype,
					rentalSubtype,
					bookingSubtype,
					primary,
					secondary,
					bookingHasEnd,
					...(returnSource ? { returnSource } : {})
				},
				{ now, actor }
			);
			if (!result.success) {
				formError = result.error;
				return;
			}
			await sharedState.setMany(result.writes);
			editorOpen = false;
		} catch (error) {
			formError =
				error instanceof RangeError || (error instanceof Error && error.message.includes('TIME'))
					? 'Kontroller dato, klokkeslett og tidssone.'
					: 'Kunne ikke lagre reiseplanen.';
		} finally {
			saving = false;
		}
	}

	$effect(() => onready({ openNew, openEdit, openReturn }));
</script>

{#if editorOpen}
	<div
		class="modal modal-open"
		role="dialog"
		aria-modal="true"
		aria-labelledby="itinerary-editor-title"
	>
		<div class="modal-box max-h-[92dvh] max-w-3xl overflow-y-auto">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-xs font-semibold tracking-wide text-primary uppercase">
						{editorLabel(entryType)}
					</p>
					<h2 id="itinerary-editor-title" class="font-display text-2xl font-bold">
						{editingKey
							? `Rediger ${editorLabel(entryType).toLowerCase()}`
							: returnSource
								? 'Legg til returfly'
								: `Ny ${editorLabel(entryType).toLowerCase()}`}
					</h2>
				</div>
				<button
					class="btn btn-square btn-ghost btn-sm"
					type="button"
					onclick={() => (editorOpen = false)}
					aria-label="Lukk"><X size={19} /></button
				>
			</div>
			<form class="mt-5 space-y-5" onsubmit={saveItem}>
				{#if entryType === 'flight'}
					<FlightEditorFields
						{legs}
						returnJourney={Boolean(returnSource)}
						{online}
						{lookupLoading}
						{lookupLegId}
						{lookupError}
						{lookupCandidates}
						{manualLegIds}
						{googlePlacesApiKey}
						{removeLeg}
						{updateDepartureDate}
						{lookupFlight}
						{applyFlightCandidate}
						{toggleManualLeg}
						{addFlightLeg}
					/>
				{:else if isTransportEntry(entryType)}
					<TransportEditorFields bind:entryType {legs} {googlePlacesApiKey} />
				{:else}
					<PlanEditorFields
						{entryType}
						bind:title
						bind:primary
						bind:secondary
						bind:staySubtype
						bind:rentalSubtype
						bind:bookingSubtype
						bind:bookingHasEnd
						{googlePlacesApiKey}
					/>
				{/if}

				<ItineraryEditorDetails
					{members}
					{selectedParticipants}
					bind:bookingReference
					bind:bookingUrl
					bind:notes
					ontoggleParticipant={toggleParticipant}
				/>
				{#if formError}<p class="alert text-sm alert-error" role="alert">{formError}</p>{/if}
				<div class="modal-action">
					<button class="btn btn-ghost" type="button" onclick={() => (editorOpen = false)}
						>Avbryt</button
					><button class="btn btn-primary" type="submit" disabled={saving}
						>{saving ? 'Lagrer …' : 'Lagre'}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}
