<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Booking URLs are validated external URLs. */
	import {
		ArrowLeftRight,
		ArrowRight,
		BedDouble,
		Bell,
		Bike,
		BusFront,
		CalendarDays,
		CarFront,
		CircleAlert,
		Clock3,
		ExternalLink,
		MapPin,
		Package,
		Pencil,
		Plane,
		Plus,
		Route,
		Sailboat,
		Ship,
		SlidersHorizontal,
		TicketCheck,
		TrainFront,
		Trash2,
		Users,
		X
	} from '@lucide/svelte';

	import { page } from '$app/state';
	import { ApiError, apiRequest } from '$lib/client/api';
	import { sharedState } from '$lib/client/state.svelte';
	import type { ItineraryMember } from '$lib/modules/itinerary/server/members';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import {
		bookingSchema,
		type EditableItineraryEndpoint,
		instantToLocalDateTime,
		type ItineraryEndpoint,
		itineraryItemKey,
		itineraryItems,
		type Journey,
		journeySchema,
		journeyTitle,
		type KeyedItineraryItem,
		localDateTimeToInstant,
		noteSchema,
		rentalSchema,
		serializeItineraryItem,
		staySchema,
		type TimelineEvent,
		timelineEvents,
		type TransportMode
	} from '../domain/itinerary';
	import EndpointFields from './EndpointFields.svelte';
	import PlaceInput from './PlaceInput.svelte';
	import TimeZoneSelect from './TimeZoneSelect.svelte';

	type TransportEntryType = 'taxi' | 'train' | 'bus' | 'ferry' | 'transfer' | 'other-transport';
	type EntryType = 'flight' | TransportEntryType | 'stay' | 'rental' | 'booking' | 'note';
	type EntryFilter = 'all' | 'flight' | 'transport' | 'stay' | 'rental' | 'booking' | 'note';
	type EditableLeg = {
		id: string;
		mode: TransportMode;
		operator: string;
		serviceNumber: string;
		from: EditableItineraryEndpoint;
		to: EditableItineraryEndpoint;
		status: 'planned' | 'delayed' | 'cancelled' | 'completed';
		notes: string;
		provider?: Journey['legs'][number]['provider'];
	};
	type FlightCandidate = {
		providerFlightId: string;
		flightNumber: string;
		operator: string;
		status: EditableLeg['status'];
		from: ItineraryEndpoint;
		to: ItineraryEndpoint;
		scheduledFrom: string;
		scheduledTo: string;
	};

	let {
		members,
		googlePlacesApiKey = ''
	}: { members: ItineraryMember[]; googlePlacesApiKey?: string } = $props();
	const timeZone = $derived(page.data.tripTimezone ?? 'Europe/Oslo');
	const tripDays = $derived(page.data.tripDays ?? []);
	const defaultDate = $derived(tripDays[0]?.date ?? new Date().toISOString().slice(0, 10));
	const finalDate = $derived(tripDays.at(-1)?.date ?? defaultDate);
	const items = $derived(itineraryItems(sharedState.values));
	const itemsByKey = $derived(new Map(items.map((item) => [item.key, item])));

	const entryChoices = [
		{ value: 'flight' as const, label: 'Fly', description: 'Ett eller flere fly', icon: Plane },
		{
			value: 'taxi' as const,
			label: 'Taxi',
			description: 'Henting og destinasjon',
			icon: CarFront
		},
		{ value: 'train' as const, label: 'Tog', description: 'Togreise', icon: TrainFront },
		{ value: 'bus' as const, label: 'Buss', description: 'Bussreise', icon: BusFront },
		{
			value: 'ferry' as const,
			label: 'Ferge / båt',
			description: 'Transport på sjøen',
			icon: Ship
		},
		{
			value: 'transfer' as const,
			label: 'Privat transport',
			description: 'Bestilt henting',
			icon: Route
		},
		{
			value: 'other-transport' as const,
			label: 'Annen transport',
			description: 'Annet transportmiddel',
			icon: Route
		},
		{
			value: 'stay' as const,
			label: 'Overnatting',
			description: 'Hotell, feriebolig eller camping',
			icon: BedDouble
		},
		{
			value: 'rental' as const,
			label: 'Leie',
			description: 'Bil, båt, sykkel eller utstyr',
			icon: CarFront
		},
		{
			value: 'booking' as const,
			label: 'Bestilling',
			description: 'Aktivitet, restaurant eller billett',
			icon: TicketCheck
		},
		{ value: 'note' as const, label: 'Påminnelse', description: 'Et tidspunkt å huske', icon: Bell }
	];
	const coreChoices = [
		{ value: 'flight' as const, label: 'Fly', description: 'Ett eller flere fly', icon: Plane },
		{
			value: 'transport' as const,
			label: 'Transport',
			description: 'Taxi, tog, buss eller båt',
			icon: TrainFront
		},
		{
			value: 'stay' as const,
			label: 'Overnatting',
			description: 'Hotell, feriebolig eller camping',
			icon: BedDouble
		},
		{
			value: 'rental' as const,
			label: 'Leie',
			description: 'Bil, båt, sykkel eller utstyr',
			icon: CarFront
		},
		{
			value: 'booking' as const,
			label: 'Bestilling',
			description: 'Aktivitet, restaurant eller billett',
			icon: TicketCheck
		},
		{ value: 'note' as const, label: 'Påminnelse', description: 'Et tidspunkt å huske', icon: Bell }
	];
	const transportChoices = entryChoices.filter((choice) =>
		['taxi', 'train', 'bus', 'ferry', 'transfer', 'other-transport'].includes(choice.value)
	) as Array<(typeof entryChoices)[number] & { value: TransportEntryType }>;
	const filterChoices = [
		{ value: 'flight' as const, label: 'Fly', icon: Plane },
		{ value: 'transport' as const, label: 'Transport', icon: TrainFront },
		{ value: 'stay' as const, label: 'Overnatting', icon: BedDouble },
		{ value: 'rental' as const, label: 'Leie', icon: CarFront },
		{ value: 'booking' as const, label: 'Bestilling', icon: TicketCheck },
		{ value: 'note' as const, label: 'Påminnelse', icon: Bell }
	];

	let entryFilter = $state<EntryFilter>('all');
	let addDialog: HTMLDialogElement;
	let filterDialog: HTMLDialogElement;
	const filteredItems = $derived(items.filter((item) => matchesFilter(item, entryFilter)));
	const events = $derived(timelineEvents(filteredItems));
	const groupedEvents = $derived.by(() => {
		const groups: { date: string; events: TimelineEvent[] }[] = [];
		for (const event of events) {
			const date = event.endpoint.localDateTime.slice(0, 10);
			const existing = groups.find((group) => group.date === date);
			if (existing) existing.events.push(event);
			else groups.push({ date, events: [event] });
		}
		return groups;
	});

	let editorOpen = $state(false);
	let editingKey = $state<string>();
	let entryType = $state<EntryType>('flight');
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
	let legs = $state<EditableLeg[]>([]);
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

	function entryTypeForItem(item: KeyedItineraryItem): EntryType {
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

	function isTransportEntry(value: EntryType): value is TransportEntryType {
		return ['taxi', 'train', 'bus', 'ferry', 'transfer', 'other-transport'].includes(value);
	}

	function transportModeFor(value: TransportEntryType): TransportMode {
		return value === 'other-transport' ? 'other' : value;
	}

	function matchesFilter(item: KeyedItineraryItem, filter: EntryFilter): boolean {
		if (filter === 'all') return true;
		if (filter === 'flight') return entryTypeForItem(item) === 'flight';
		if (filter === 'transport')
			return item.kind === 'journey' && entryTypeForItem(item) !== 'flight';
		return item.kind === filter;
	}

	function choiceFor(value: EntryType) {
		return entryChoices.find((choice) => choice.value === value);
	}

	function editorLabel(value: EntryType): string {
		return isTransportEntry(value) ? 'Transport' : (choiceFor(value)?.label ?? value);
	}

	function filterLabel(value: EntryFilter): string {
		return value === 'all'
			? 'Alle planer'
			: (filterChoices.find((choice) => choice.value === value)?.label ?? value);
	}

	function hasParticipantException(item: KeyedItineraryItem): boolean {
		return members.length > 0 && members.some((member) => !item.participants.includes(member.name));
	}

	function hasReturnJourney(item: Journey): boolean {
		return items.some(
			(candidate) =>
				candidate.kind === 'journey' &&
				candidate.groupId === item.groupId &&
				candidate.direction === 'return'
		);
	}

	function blankEndpoint(
		locationName = '',
		locationCode = '',
		time = '09:00',
		date?: string,
		zone?: string
	): EditableItineraryEndpoint {
		return {
			locationName,
			locationCode,
			localDateTime: `${date ?? defaultDate}T${time}`,
			timeZone: zone ?? timeZone,
			terminal: '',
			gate: '',
			platform: ''
		};
	}

	function editableEndpoint(endpoint: ItineraryEndpoint): EditableItineraryEndpoint {
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

	function endpointWithInstant(endpoint: EditableItineraryEndpoint): ItineraryEndpoint {
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

	function blankLeg(mode: TransportMode, from?: EditableItineraryEndpoint): EditableLeg {
		const departure = from ? { ...from } : blankEndpoint('', '', '09:00');
		const departureInstant = localDateTimeToInstant(departure.localDateTime, departure.timeZone);
		const arrivalInstant = new Date(new Date(departureInstant).getTime() + 2 * 60 * 60_000);
		return {
			id: crypto.randomUUID(),
			mode,
			operator: '',
			serviceNumber: '',
			from: departure,
			to: blankEndpoint(
				'',
				'',
				instantToLocalDateTime(arrivalInstant.toISOString(), departure.timeZone).slice(11),
				instantToLocalDateTime(arrivalInstant.toISOString(), departure.timeZone).slice(0, 10),
				departure.timeZone
			),
			status: 'planned',
			notes: ''
		};
	}

	function resetEditor(type: EntryType): void {
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

	function openNew(type: EntryType): void {
		resetEditor(type);
		if (addDialog.open) addDialog.close();
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

	function minutesOnDate(date: string, minutes: number): string {
		return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + minutes * 60_000)
			.toISOString()
			.slice(0, 16);
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

	function updateDepartureDate(leg: EditableLeg, date: string): void {
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

	async function lookupFlight(leg: EditableLeg): Promise<void> {
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

	function flightLookupError(error: unknown): string {
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
			const normalizedLegs = legs.map((leg) => {
				const from = endpointWithInstant(leg.from);
				const hidesArrival = entryType === 'taxi' || entryType === 'transfer';
				return {
					...leg,
					mode:
						entryType === 'flight'
							? ('flight' as const)
							: isTransportEntry(entryType)
								? transportModeFor(entryType)
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
				id: itemId,
				title:
					entryType === 'flight' || isTransportEntry(entryType)
						? journeyTitle(normalizedLegs)
						: title.trim(),
				bookingReference: bookingReference.trim(),
				bookingUrl: bookingUrl.trim(),
				participants: [...selectedParticipants],
				notes: notes.trim(),
				createdAt: createdAt || now,
				createdBy: actor,
				updatedAt: now,
				tombstone: false,
				version: 1 as const
			};
			let parsed;
			if (entryType === 'flight' || isTransportEntry(entryType)) {
				parsed = journeySchema.safeParse({
					...common,
					kind: 'journey',
					groupId: journeyGroupId,
					direction: journeyDirection,
					legs:
						isTransportEntry(entryType) && !editingKey ? normalizedLegs.slice(0, 1) : normalizedLegs
				});
			} else
				switch (entryType) {
					case 'stay':
						parsed = staySchema.safeParse({
							...common,
							kind: 'stay',
							subtype: staySubtype,
							checkIn: endpointWithInstant(primary),
							checkOut: endpointWithInstant({
								...secondary,
								locationName: primary.locationName,
								locationCode: primary.locationCode,
								timeZone: primary.timeZone
							})
						});
						break;
					case 'rental':
						parsed = rentalSchema.safeParse({
							...common,
							kind: 'rental',
							subtype: rentalSubtype,
							pickup: endpointWithInstant(primary),
							return: endpointWithInstant(secondary)
						});
						break;
					case 'booking':
						parsed = bookingSchema.safeParse({
							...common,
							kind: 'booking',
							subtype: bookingSubtype,
							start: endpointWithInstant(primary),
							...(bookingHasEnd ? { end: endpointWithInstant(secondary) } : {})
						});
						break;
					case 'note':
						parsed = noteSchema.safeParse({
							...common,
							kind: 'note',
							at: endpointWithInstant(primary)
						});
						break;
				}
			if (!parsed.success) {
				formError = parsed.error.issues[0]?.message ?? 'Kontroller feltene.';
				return;
			}
			const writes = [
				{
					key: editingKey ?? itineraryItemKey(parsed.data.id),
					value: serializeItineraryItem(parsed.data)
				}
			];
			if (returnSource && returnSource.direction === 'one-way') {
				const sourceItem = Object.fromEntries(
					Object.entries(returnSource).filter(([name]) => name !== 'key')
				);
				writes.unshift({
					key: returnSource.key,
					value: serializeItineraryItem(
						journeySchema.parse({ ...sourceItem, direction: 'outbound', updatedAt: now })
					)
				});
			}
			await sharedState.setMany(writes);
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

	async function deleteItem(item: KeyedItineraryItem): Promise<void> {
		if (!window.confirm(`Fjerne «${item.title}» fra reiseplanen?`)) return;
		await sharedState.set(
			item.key,
			serializeItineraryItem({ ...item, tombstone: true, updatedAt: new Date().toISOString() })
		);
	}

	function dateLabel(date: string): string {
		return new Intl.DateTimeFormat('nb-NO', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		}).format(new Date(`${date}T12:00:00Z`));
	}

	function timeLabel(endpoint: ItineraryEndpoint): string {
		return endpoint.localDateTime.slice(11);
	}

	function utcOffsetLabel(endpoint: ItineraryEndpoint): string {
		const part = new Intl.DateTimeFormat('en-GB', {
			timeZone: endpoint.timeZone,
			timeZoneName: 'shortOffset'
		})
			.formatToParts(new Date(endpoint.instant))
			.find((value) => value.type === 'timeZoneName')?.value;
		return part?.replace('GMT+0', 'GMT') ?? 'GMT';
	}

	function durationLabel(minutes: number): string {
		if (minutes < 0) return `${Math.abs(minutes)} min overlapp`;
		const hours = Math.floor(minutes / 60);
		const remainder = minutes % 60;
		return hours ? `${hours} t${remainder ? ` ${remainder} min` : ''}` : `${remainder} min`;
	}

	function endpointDetails(endpoint: ItineraryEndpoint): string[] {
		return [
			endpoint.terminal ? `Terminal ${endpoint.terminal}` : '',
			endpoint.gate ? `Gate ${endpoint.gate}` : '',
			endpoint.platform && endpoint.platform !== endpoint.gate ? `Spor ${endpoint.platform}` : ''
		].filter(Boolean);
	}

	function endpointName(endpoint: ItineraryEndpoint): string {
		return endpoint.locationCode || endpoint.locationName;
	}

	function iconForEvent(event: TimelineEvent, item?: KeyedItineraryItem) {
		if (event.mode === 'flight') return Plane;
		if (event.mode === 'train') return TrainFront;
		if (event.mode === 'bus') return BusFront;
		if (event.mode === 'ferry') return Ship;
		if (event.mode === 'taxi') return CarFront;
		if (event.kind === 'stay') return BedDouble;
		if (item?.kind === 'rental') {
			if (item.subtype === 'boat') return Sailboat;
			if (item.subtype === 'bike') return Bike;
			if (item.subtype === 'equipment' || item.subtype === 'other') return Package;
			return CarFront;
		}
		if (event.kind === 'booking') return TicketCheck;
		if (event.kind === 'note') return Bell;
		return Route;
	}
</script>

<svelte:head><title>Reiseplan · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-3xl px-4 py-5 pb-10 lg:py-7">
	<header class="mb-5">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="text-sm font-semibold text-primary">Hele reisen</p>
			<SyncStatus />
		</div>
		<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Reiseplan</h1>
	</header>

	<div class="mb-5 flex items-center gap-2">
		<button
			class="btn min-w-0 flex-1 justify-between border-base-300 bg-base-100 sm:flex-none"
			type="button"
			onclick={() => filterDialog.showModal()}
			aria-label="Filtrer reiseplan"
		>
			<span class="flex min-w-0 items-center gap-2"
				><SlidersHorizontal class="shrink-0" size={17} />
				<span class="truncate">{filterLabel(entryFilter)}</span></span
			>
			{#if entryFilter !== 'all'}<span class="badge shrink-0 badge-sm badge-primary">1</span>{/if}
		</button>
		<button
			class="btn shrink-0 btn-primary"
			type="button"
			disabled={!sharedState.ready}
			onclick={() => addDialog.showModal()}><Plus size={17} /> Legg til</button
		>
	</div>

	{#if !sharedState.ready}
		<div class="space-y-3" aria-label="Laster reiseplan">
			<div class="h-24 w-full skeleton"></div>
			<div class="h-24 w-full skeleton"></div>
		</div>
	{:else if groupedEvents.length === 0}
		<div
			class="rounded-2xl border border-dashed border-base-300 bg-base-100 px-5 py-12 text-center"
		>
			<CalendarDays class="mx-auto text-primary" size={38} />
			<h2 class="font-display mt-3 text-xl font-bold">
				{entryFilter === 'all'
					? 'Reiseplanen er tom'
					: `Ingen ${filterLabel(entryFilter).toLowerCase()}`}
			</h2>
			<p class="mx-auto mt-2 max-w-sm text-sm text-base-content/60">
				Legg til fly, transport, overnatting eller andre planer.
			</p>
			<button class="btn mt-5 btn-primary" type="button" onclick={() => addDialog.showModal()}
				><Plus size={18} /> Legg til plan</button
			>
		</div>
	{:else}
		<div
			class="relative ml-2 border-l-2 border-primary/20 pl-5"
			data-itinerary-timeline
			aria-label="Reisens tidslinje"
		>
			{#each groupedEvents as group, groupIndex (group.date)}
				<section class:mt-8={groupIndex > 0} class="relative">
					<span
						class="absolute top-3 -left-[1.55rem] size-2 rounded-full bg-primary/60"
						aria-hidden="true"
					></span>
					<h2
						class="font-display mb-4 pl-1 text-xl font-bold text-base-content capitalize"
						data-timeline-date={group.date}
					>
						{dateLabel(group.date)}
					</h2>
					{#each group.events as event (event.id)}
						{@const item = itemsByKey.get(event.sourceKey)}
						{@const EventIcon = iconForEvent(event, item)}
						<article class="relative pb-4">
							<span
								class="absolute top-5 -left-[2.15rem] grid size-7 place-items-center rounded-full border-2 border-base-200 bg-primary text-primary-content"
								><EventIcon size={14} /></span
							>
							<div
								class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm"
								class:border-warning={event.connectionMinutes !== undefined &&
									event.connectionMinutes < 60}
								class:opacity-60={event.status === 'cancelled'}
							>
								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 flex-wrap items-center gap-2">
										<span class="badge max-w-full gap-1.5 badge-ghost badge-sm"
											><EventIcon class="shrink-0" size={12} /><span class="truncate"
												>{event.label}</span
											></span
										>
										{#if event.status === 'delayed'}<span class="badge badge-sm badge-warning"
												>Forsinket</span
											>{/if}
										{#if event.status === 'cancelled'}<span class="badge badge-sm badge-error"
												>Kansellert</span
											>{/if}
									</div>
									{#if item}<div class="flex shrink-0 items-center">
											<button
												class="btn btn-square btn-ghost btn-xs"
												type="button"
												onclick={() => openEdit(item)}
												aria-label={`Rediger ${item.title}`}><Pencil size={15} /></button
											><button
												class="btn btn-square btn-ghost text-error btn-xs"
												type="button"
												onclick={() => deleteItem(item)}
												aria-label={`Fjern ${item.title}`}><Trash2 size={15} /></button
											>
										</div>{/if}
								</div>
								{#if event.type === 'journey-leg' && event.endEndpoint && (event.mode === 'taxi' || event.mode === 'transfer')}
									<div class="mt-4">
										<div class="flex items-baseline gap-2">
											<p class="text-xl font-bold tabular-nums">{timeLabel(event.endpoint)}</p>
											<p class="text-[10px] font-semibold text-base-content/45">
												{utcOffsetLabel(event.endpoint)}
											</p>
										</div>
										<div
											class="mt-3 grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2"
										>
											<p class="min-w-0 font-bold break-words">{event.endpoint.locationName}</p>
											<span
												class="grid size-8 place-items-center rounded-full bg-primary/10 text-primary"
												><ArrowRight size={17} /></span
											>
											<p class="min-w-0 text-right font-bold break-words">
												{event.endEndpoint.locationName}
											</p>
										</div>
									</div>
								{:else if event.type === 'journey-leg' && event.endEndpoint}
									<div
										class="mt-4 grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2"
									>
										<div class="min-w-0">
											<p class="text-lg font-bold tabular-nums">{timeLabel(event.endpoint)}</p>
											<p class="text-[10px] font-semibold text-base-content/45">
												{utcOffsetLabel(event.endpoint)}
											</p>
											<p class="mt-2 text-2xl font-bold tracking-wide">
												{endpointName(event.endpoint)}
											</p>
											<p class="mt-0.5 line-clamp-2 text-xs leading-tight text-base-content/55">
												{event.endpoint.locationName}
											</p>
										</div>
										<span
											class="grid size-8 place-items-center rounded-full bg-primary/10 text-primary"
											><ArrowRight size={17} /></span
										>
										<div class="min-w-0 text-right">
											<p class="text-lg font-bold tabular-nums">{timeLabel(event.endEndpoint)}</p>
											<p class="text-[10px] font-semibold text-base-content/45">
												{utcOffsetLabel(event.endEndpoint)}
											</p>
											<p class="mt-2 text-2xl font-bold tracking-wide">
												{endpointName(event.endEndpoint)}
											</p>
											<p class="mt-0.5 line-clamp-2 text-xs leading-tight text-base-content/55">
												{event.endEndpoint.locationName}
											</p>
										</div>
									</div>
									{#if event.connectionMinutes !== undefined}<p
											class="mt-3 flex items-center gap-1.5 text-xs font-semibold"
											class:text-warning={event.connectionMinutes < 60}
										>
											{#if event.connectionMinutes < 60}<CircleAlert size={14} />{:else}<Clock3
													size={14}
												/>{/if}{durationLabel(event.connectionMinutes)} overgang
										</p>{/if}
								{:else}
									<div class="mt-4 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
										<div class="text-center">
											<p class="text-lg font-bold tabular-nums">{timeLabel(event.endpoint)}</p>
											<p class="text-[10px] font-semibold text-base-content/45">
												{utcOffsetLabel(event.endpoint)}
											</p>
										</div>
										<div class="min-w-0">
											<h3 class="font-bold">{event.title}</h3>
											<p class="mt-1 flex items-center gap-1 text-sm text-base-content/65">
												<MapPin size={14} />
												{event.detail || event.endpoint.locationName}
											</p>
										</div>
									</div>
								{/if}
								{#if endpointDetails(event.endpoint).length}<p
										class="mt-2 text-xs text-base-content/55"
									>
										{endpointDetails(event.endpoint).join(' · ')}
									</p>{/if}
								{#if item?.bookingReference}<p class="mt-2 text-xs">
										<strong>Referanse:</strong>
										{item.bookingReference}
									</p>{/if}
								{#if item && hasParticipantException(item)}<p
										class="mt-1 flex items-center gap-1 text-xs text-base-content/55"
									>
										<Users size={13} />
										{item.participants.length ? item.participants.join(', ') : 'Ingen reisende'}
									</p>{/if}
								{#if item?.bookingUrl || item?.notes || (item?.kind === 'journey' && entryTypeForItem(item) === 'flight' && item.direction !== 'return' && !hasReturnJourney(item) && event.legIndex === 0)}<div
										class="mt-4 flex flex-wrap items-center gap-2 border-t border-base-200 pt-3"
									>
										{#if item.bookingUrl}<a
												class="btn btn-ghost btn-xs"
												href={item.bookingUrl}
												target="_blank"
												rel="noreferrer"><ExternalLink size={13} /> Åpne bestilling</a
											>{/if}{#if item.notes}<span class="text-xs text-base-content/55"
												>{item.notes}</span
											>{/if}{#if item.kind === 'journey' && entryTypeForItem(item) === 'flight' && item.direction !== 'return' && !hasReturnJourney(item) && event.legIndex === 0}<button
												class="btn ml-auto btn-ghost btn-xs"
												type="button"
												onclick={() => openReturn(item)}
												><ArrowLeftRight size={13} /> Legg til retur</button
											>{/if}
									</div>{/if}
							</div>
						</article>
					{/each}
				</section>
			{/each}
		</div>
	{/if}
</section>

<dialog
	bind:this={addDialog}
	class="modal modal-bottom sm:modal-middle"
	aria-labelledby="add-plan-title"
>
	<div class="modal-box max-w-lg rounded-t-2xl sm:rounded-box">
		<div class="flex items-center justify-between">
			<h2 id="add-plan-title" class="font-display text-2xl font-bold">Hva vil du legge til?</h2>
			<button
				class="btn btn-square btn-ghost btn-sm"
				type="button"
				onclick={() => addDialog.close()}
				aria-label="Lukk"><X size={19} /></button
			>
		</div>
		<div class="mt-5 grid grid-cols-2 gap-3">
			{#each coreChoices as choice (choice.value)}<button
					class="flex min-h-28 flex-col items-start justify-center rounded-xl border border-base-300 bg-base-100 p-4 text-left hover:border-primary hover:bg-primary/5"
					type="button"
					onclick={() => openNew(choice.value === 'transport' ? 'taxi' : choice.value)}
					><choice.icon class="mb-2 text-primary" size={23} /><span class="font-bold"
						>{choice.label}</span
					><span class="mt-1 text-xs text-base-content/55">{choice.description}</span></button
				>{/each}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk valg">Lukk</button>
	</form>
</dialog>

<dialog
	bind:this={filterDialog}
	class="modal modal-bottom sm:modal-middle"
	aria-labelledby="itinerary-filter-title"
>
	<div class="modal-box max-w-sm rounded-t-2xl sm:rounded-box">
		<h2 id="itinerary-filter-title" class="font-display text-2xl font-bold">Vis i tidslinjen</h2>
		<div class="mt-4 space-y-2">
			<button
				class="btn w-full justify-start"
				class:btn-primary={entryFilter === 'all'}
				class:btn-ghost={entryFilter !== 'all'}
				type="button"
				onclick={() => {
					entryFilter = 'all';
					filterDialog.close();
				}}><CalendarDays size={17} /> Alle planer</button
			>{#each filterChoices as choice (choice.value)}<button
					class="btn w-full justify-start"
					class:btn-primary={entryFilter === choice.value}
					class:btn-ghost={entryFilter !== choice.value}
					type="button"
					onclick={() => {
						entryFilter = choice.value;
						filterDialog.close();
					}}><choice.icon size={17} /> {choice.label}</button
				>{/each}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk filter">Lukk</button>
	</form>
</dialog>

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
					<section class="space-y-4">
						<p class="text-sm text-base-content/55">
							{returnSource
								? 'Skriv inn flightnummeret for returen. Legg bare til en mellomlanding hvis returen har flere fly.'
								: 'Skriv inn flightnummer og dato. Flydetaljene fylles ut automatisk.'}
						</p>
						{#each legs as leg, index (leg.id)}<div
								class="rounded-2xl border border-base-300 bg-base-200/45 p-4"
								data-flight-leg={index + 1}
							>
								{#if legs.length > 1}<div class="mb-3 flex items-center justify-between">
										<h4 class="flex items-center gap-2 font-bold">
											<Plane size={17} />
											{index === 0 ? 'Første fly' : `Fly ${index + 1}`}
										</h4>
										<button
											class="btn btn-square btn-ghost text-error btn-sm"
											type="button"
											disabled={legs.length === 1}
											onclick={() => removeLeg(index)}
											aria-label={`Fjern flyvning ${index + 1}`}><Trash2 size={16} /></button
										>
									</div>{/if}
								<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
									<label class="block"
										><span class="mb-1 block text-sm font-semibold">Flightnummer</span><input
											class="input w-full uppercase input-sm"
											bind:value={leg.serviceNumber}
											maxlength="30"
											placeholder="SK1461"
											required
										/></label
									><label class="block"
										><span class="mb-1 block text-sm font-semibold">Avreisedato</span><input
											class="input w-full input-sm"
											type="date"
											value={leg.from.localDateTime.slice(0, 10)}
											oninput={(event) => updateDepartureDate(leg, event.currentTarget.value)}
											required
										/></label
									><button
										class="btn self-end btn-primary btn-sm"
										type="button"
										disabled={lookupLoading && lookupLegId === leg.id}
										onclick={() => lookupFlight(leg)}
										>{lookupLoading && lookupLegId === leg.id ? 'Henter …' : 'Hent flydata'}</button
									>
								</div>
								{#if leg.provider}<div
										class="mt-3 rounded-xl border border-success/30 bg-success/5 p-3"
									>
										<p class="font-semibold">
											{leg.serviceNumber} · {leg.from.locationCode || leg.from.locationName} → {leg
												.to.locationCode || leg.to.locationName}
										</p>
										<p class="mt-1 text-xs text-base-content/60">
											{leg.from.localDateTime.replace('T', ' ')} – {leg.to.localDateTime.replace(
												'T',
												' '
											)}
										</p>
									</div>{/if}
								{#if lookupLegId === leg.id && (lookupError || lookupCandidates.length)}<div
										class="mt-3 rounded-xl border border-base-300 bg-base-100 p-3"
									>
										{#if lookupError}<p class="text-sm text-warning">
												{lookupError}
											</p>{/if}{#if lookupCandidates.length}<p class="mb-2 text-sm font-semibold">
												Velg flyvning
											</p>
											<div class="space-y-2">
												{#each lookupCandidates as candidate (candidate.providerFlightId)}<button
														class="btn h-auto w-full justify-start btn-ghost py-2 text-left"
														type="button"
														onclick={() => applyFlightCandidate(candidate, leg.id)}
														><span
															><strong>{candidate.flightNumber}</strong> · {candidate.from
																.locationCode}
															{candidate.from.localDateTime.replace('T', ' ')} → {candidate.to
																.locationCode}
															{candidate.to.localDateTime.replace('T', ' ')}</span
														></button
													>{/each}
											</div>{/if}
									</div>{/if}
								<button
									class="btn mt-3 btn-ghost btn-xs"
									type="button"
									onclick={() => toggleManualLeg(leg.id)}
									>{manualLegIds.includes(leg.id)
										? 'Skjul manuelle detaljer'
										: 'Fyll inn eller korriger manuelt'}</button
								>
								{#if manualLegIds.includes(leg.id)}<div class="mt-3 space-y-3">
										<label class="block"
											><span class="mb-1 block text-sm font-semibold">Flyselskap</span><input
												class="input w-full input-sm"
												bind:value={leg.operator}
												maxlength="100"
												placeholder="SAS"
											/></label
										>
										<div class="grid gap-3 lg:grid-cols-2">
											<EndpointFields
												label="Fra"
												bind:endpoint={leg.from}
												travelDetails={true}
												placeLabel="Flyplass"
												{googlePlacesApiKey}
											/><EndpointFields
												label="Til"
												bind:endpoint={leg.to}
												travelDetails={true}
												placeLabel="Flyplass"
												{googlePlacesApiKey}
											/>
										</div>
									</div>{/if}
							</div>{/each}
						<button class="btn w-full btn-outline btn-sm" type="button" onclick={addFlightLeg}
							><Plus size={16} /> Legg til mellomlanding</button
						>
					</section>
				{:else if isTransportEntry(entryType)}
					{@const leg = legs[0]!}
					<label class="block">
						<span class="mb-1 block font-semibold">Transportmiddel</span>
						<select class="select w-full" bind:value={entryType}>
							{#each transportChoices as choice (choice.value)}
								<option value={choice.value}>{choice.label}</option>
							{/each}
						</select>
					</label>
					{#if entryType === 'taxi' || entryType === 'transfer'}
						<label class="block"
							><span class="mb-1 block font-semibold"
								>{entryType === 'taxi' ? 'Taxiselskap (valgfritt)' : 'Selskap (valgfritt)'}</span
							><input class="input w-full" bind:value={leg.operator} maxlength="100" /></label
						>
						<div class="grid gap-4 sm:grid-cols-2">
							<PlaceInput
								label="Hentested"
								bind:value={leg.from.locationName}
								apiKey={googlePlacesApiKey}
							/>
							<label class="block"
								><span class="mb-1 block font-semibold">Hentetid</span><input
									class="input w-full"
									type="datetime-local"
									bind:value={leg.from.localDateTime}
									required
								/></label
							>
							<div class="sm:col-span-2">
								<PlaceInput
									label="Destinasjon"
									bind:value={leg.to.locationName}
									apiKey={googlePlacesApiKey}
								/>
							</div>
						</div>
						<details class="rounded-xl border border-base-300 p-3">
							<summary class="cursor-pointer text-sm font-semibold text-base-content/60"
								>Tidssone</summary
							>
							<div class="mt-3">
								<TimeZoneSelect bind:value={leg.from.timeZone} at={leg.from.localDateTime} />
							</div>
						</details>
					{:else}
						<div class="grid gap-3 sm:grid-cols-2">
							<label class="block"
								><span class="mb-1 block font-semibold"
									>{entryType === 'ferry' ? 'Rederi (valgfritt)' : 'Selskap (valgfritt)'}</span
								><input class="input w-full" bind:value={leg.operator} maxlength="100" /></label
							><label class="block"
								><span class="mb-1 block font-semibold">Rutenummer (valgfritt)</span><input
									class="input w-full"
									bind:value={leg.serviceNumber}
									maxlength="30"
								/></label
							>
						</div>
						<div class="grid gap-4 lg:grid-cols-2">
							<EndpointFields
								label="Fra"
								bind:endpoint={leg.from}
								{googlePlacesApiKey}
							/><EndpointFields label="Til" bind:endpoint={leg.to} {googlePlacesApiKey} />
						</div>
					{/if}
				{:else}
					<label class="block"
						><span class="mb-1 block font-semibold"
							>{entryType === 'stay'
								? 'Navn på overnatting'
								: entryType === 'rental'
									? 'Utleier / utleieselskap'
									: entryType === 'booking'
										? 'Hva er bestilt?'
										: 'Påminnelse'}</span
						><input
							class="input w-full"
							bind:value={title}
							required
							maxlength="200"
							placeholder={entryType === 'stay'
								? 'Hotel Norge'
								: entryType === 'rental'
									? 'Hertz'
									: entryType === 'booking'
										? 'Kajakktur'
										: undefined}
						/></label
					>
					{#if entryType === 'stay'}<PlaceInput
							label="Sted"
							bind:value={primary.locationName}
							apiKey={googlePlacesApiKey}
							placeholder="Split"
						/><label class="block"
							><span class="mb-1 block font-semibold">Type</span><select
								class="select w-full"
								bind:value={staySubtype}
								><option value="hotel">Hotell</option><option value="holiday-rental"
									>Airbnb / feriebolig</option
								><option value="camping">Camping</option><option value="other">Annet</option
								></select
							></label
						>
						<div class="grid gap-4 sm:grid-cols-2">
							<label class="block"
								><span class="mb-1 block font-semibold">Innsjekking</span><input
									class="input w-full"
									type="datetime-local"
									bind:value={primary.localDateTime}
									required
								/></label
							><label class="block"
								><span class="mb-1 block font-semibold">Utsjekking</span><input
									class="input w-full"
									type="datetime-local"
									bind:value={secondary.localDateTime}
									required
								/></label
							>
						</div>
						<details class="rounded-xl border border-base-300 p-3">
							<summary class="cursor-pointer text-sm font-semibold text-base-content/60"
								>Tidssone</summary
							>
							<div class="mt-3">
								<TimeZoneSelect
									bind:value={primary.timeZone}
									label="Tidssone for oppholdet"
									at={primary.localDateTime}
								/>
							</div>
						</details>
					{:else if entryType === 'rental'}<label class="block"
							><span class="mb-1 block font-semibold">Type</span><select
								class="select w-full"
								bind:value={rentalSubtype}
								><option value="car">Bil</option><option value="boat">Båt</option><option
									value="bike">Sykkel / scooter</option
								><option value="equipment">Utstyr</option><option value="other">Annet</option
								></select
							></label
						>
						<div class="grid gap-4 lg:grid-cols-2">
							<EndpointFields
								label="Henting"
								bind:endpoint={primary}
								{googlePlacesApiKey}
							/><EndpointFields label="Levering" bind:endpoint={secondary} {googlePlacesApiKey} />
						</div>
					{:else if entryType === 'booking'}<div class="grid gap-3 sm:grid-cols-2">
							<label class="block"
								><span class="mb-1 block font-semibold">Type</span><select
									class="select w-full"
									bind:value={bookingSubtype}
									><option value="activity">Aktivitet / utflukt</option><option value="restaurant"
										>Restaurant</option
									><option value="event">Arrangement / billett</option><option value="appointment"
										>Avtale</option
									><option value="other">Annet</option></select
								></label
							><label class="flex items-center gap-3 self-end rounded-xl border border-base-300 p-3"
								><input
									class="checkbox checkbox-primary"
									type="checkbox"
									bind:checked={bookingHasEnd}
								/><span class="font-semibold">Har sluttid</span></label
							>
						</div>
						<div class="grid gap-4 lg:grid-cols-2">
							<EndpointFields
								label="Start"
								bind:endpoint={primary}
								{googlePlacesApiKey}
							/>{#if bookingHasEnd}<EndpointFields
									label="Slutt"
									bind:endpoint={secondary}
									{googlePlacesApiKey}
								/>{/if}
						</div>
					{:else}<EndpointFields
							label="Tid og sted"
							bind:endpoint={primary}
							{googlePlacesApiKey}
						/>{/if}
				{/if}

				{#if members.length}<fieldset class="rounded-xl border border-base-300 p-3">
						<legend class="px-1 text-sm font-bold">Reisende</legend>
						<p class="mb-3 text-xs text-base-content/55">
							Alle er valgt som standard. Trykk for å velge bort.
						</p>
						<div class="flex flex-wrap gap-2">
							{#each members as member (member.id)}<button
									class="btn btn-sm"
									class:btn-primary={selectedParticipants.includes(member.name)}
									class:btn-ghost={!selectedParticipants.includes(member.name)}
									type="button"
									aria-pressed={selectedParticipants.includes(member.name)}
									onclick={() => toggleParticipant(member.name)}
									><Users size={14} /> {member.name}</button
								>{/each}
						</div>
					</fieldset>{/if}
				<details class="rounded-xl border border-base-300 p-3">
					<summary class="cursor-pointer font-semibold">Bestilling og notater</summary>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<label class="block"
							><span class="mb-1 block text-sm font-semibold">Referanse</span><input
								class="input w-full input-sm"
								bind:value={bookingReference}
								maxlength="100"
							/></label
						><label class="block"
							><span class="mb-1 block text-sm font-semibold">Lenke</span><input
								class="input w-full input-sm"
								type="url"
								bind:value={bookingUrl}
								maxlength="1000"
								placeholder="https://…"
							/></label
						><label class="block sm:col-span-2"
							><span class="mb-1 block text-sm font-semibold">Notater</span><textarea
								class="textarea min-h-20 w-full"
								bind:value={notes}
								maxlength="4000"></textarea></label
						>
					</div>
				</details>
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
