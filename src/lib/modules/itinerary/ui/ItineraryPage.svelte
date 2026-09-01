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
		WifiOff,
		X
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { watchOnlineStatus } from '$lib/client/online';
	import { sharedState } from '$lib/client/state.svelte';
	import type { ItineraryMember } from '$lib/modules/itinerary/server/members';
	import ModalDialog from '$lib/ui/ModalDialog.svelte';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import {
		type ItineraryEndpoint,
		itineraryItems,
		type Journey,
		type KeyedItineraryItem,
		serializeItineraryItem,
		type TimelineEvent,
		timelineEvents
	} from '../domain/itinerary';
	import type { ItineraryEditorControls, ItineraryEntryType } from './itinerary-editor';
	import ItineraryEditor from './ItineraryEditor.svelte';
	import TransportJourneyCard from './TransportJourneyCard.svelte';

	type EntryFilter = 'all' | 'flight' | 'transport' | 'stay' | 'rental' | 'booking' | 'note';

	let {
		members,
		googlePlacesApiKey = ''
	}: { members: ItineraryMember[]; googlePlacesApiKey?: string } = $props();
	let online = $state(true);
	const timeZone = $derived(page.data.tripTimezone ?? 'Europe/Oslo');
	const tripDays = $derived(page.data.tripDays ?? []);
	const defaultDate = $derived(tripDays[0]?.date ?? new Date().toISOString().slice(0, 10));
	const finalDate = $derived(tripDays.at(-1)?.date ?? defaultDate);
	const items = $derived(itineraryItems(sharedState.values));
	const itemsByKey = $derived(new Map(items.map((item) => [item.key, item])));

	const choiceMetadata = {
		flight: { label: 'Fly', description: 'Ett eller flere fly', icon: Plane },
		transport: {
			label: 'Transport',
			description: 'Taxi, tog, buss eller båt',
			icon: TrainFront
		},
		taxi: { label: 'Taxi', description: 'Henting og destinasjon', icon: CarFront },
		train: { label: 'Tog', description: 'Togreise', icon: TrainFront },
		bus: { label: 'Buss', description: 'Bussreise', icon: BusFront },
		ferry: { label: 'Ferge / båt', description: 'Transport på sjøen', icon: Ship },
		transfer: { label: 'Privat transport', description: 'Bestilt henting', icon: Route },
		'other-transport': {
			label: 'Annen transport',
			description: 'Annet transportmiddel',
			icon: Route
		},
		stay: {
			label: 'Overnatting',
			description: 'Hotell, feriebolig eller camping',
			icon: BedDouble
		},
		rental: { label: 'Leie', description: 'Bil, båt, sykkel eller utstyr', icon: CarFront },
		booking: {
			label: 'Bestilling',
			description: 'Aktivitet, restaurant eller billett',
			icon: TicketCheck
		},
		note: { label: 'Påminnelse', description: 'Et tidspunkt å huske', icon: Bell }
	} as const;
	const choices = <T extends keyof typeof choiceMetadata>(values: readonly T[]) =>
		values.map((value) => ({ value, ...choiceMetadata[value] }));

	const coreChoices = choices(['flight', 'transport', 'stay', 'rental', 'booking', 'note']);
	const filterChoices = coreChoices.map(({ value, label, icon }) => ({ value, label, icon }));

	let entryFilter = $state<EntryFilter>('all');
	let addDialog = $state<HTMLDialogElement>(undefined!);
	let filterDialog = $state<HTMLDialogElement>(undefined!);
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

	let editorControls = $state<ItineraryEditorControls>();

	function entryTypeForItem(item: KeyedItineraryItem): ItineraryEntryType {
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

	function openNew(type: ItineraryEntryType): void {
		addDialog.close();
		editorControls?.openNew(type);
	}

	function openEdit(item: KeyedItineraryItem): void {
		editorControls?.openEdit(item);
	}

	function openReturn(item: KeyedItineraryItem & Journey): void {
		editorControls?.openReturn(item);
	}

	function matchesFilter(item: KeyedItineraryItem, filter: EntryFilter): boolean {
		if (filter === 'all') return true;
		if (filter === 'flight') return entryTypeForItem(item) === 'flight';
		if (filter === 'transport')
			return item.kind === 'journey' && entryTypeForItem(item) !== 'flight';
		return item.kind === filter;
	}

	function filterLabel(value: EntryFilter): string {
		return value === 'all' ? 'Alle planer' : choiceMetadata[value].label;
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

	onMount(() => watchOnlineStatus((value) => (online = value)));
</script>

<svelte:head><title>Reiseplan · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-3xl px-4 py-5 pb-10 lg:py-7">
	<header class="mb-5">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="text-sm font-semibold text-primary">Hele reisen</p>
			<SyncStatus />
		</div>
		<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Reiseplan</h1>
		{#if !online}
			<p class="mt-2 flex items-center gap-1.5 text-xs text-base-content/60" role="status">
				<WifiOff size={14} /> Planlegging og manuell redigering virker uten nett. Flydata og stedsforslag
				krever nett.
			</p>
		{/if}
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
								{#if event.type === 'journey-leg' && event.endEndpoint && event.mode && event.mode !== 'flight'}
									<TransportJourneyCard
										from={event.endpoint}
										to={event.endEndpoint}
										mode={event.mode}
									/>
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
								{#if endpointDetails(event.endpoint).length && !(event.type === 'journey-leg' && event.mode !== 'flight')}<p
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

<ModalDialog
	bind:dialog={addDialog}
	modalClass="modal modal-bottom sm:modal-middle"
	boxClass="modal-box max-w-lg rounded-t-2xl sm:rounded-box"
	labelledBy="add-plan-title"
	closeLabel="Lukk valg"
>
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
</ModalDialog>

<ModalDialog
	bind:dialog={filterDialog}
	modalClass="modal modal-bottom sm:modal-middle"
	boxClass="modal-box max-w-sm rounded-t-2xl sm:rounded-box"
	labelledBy="itinerary-filter-title"
	closeLabel="Lukk filter"
>
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
</ModalDialog>

<ItineraryEditor
	{members}
	{googlePlacesApiKey}
	{online}
	{defaultDate}
	{finalDate}
	{timeZone}
	onready={(controls) => (editorControls = controls)}
/>
