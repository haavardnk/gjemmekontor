<script lang="ts">
	import { CirclePlus, FileCheck2, Pencil, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { apiRequest } from '$lib/client/api';
	import { sharedState } from '$lib/client/state.svelte';
	import {
		type MapApiResponse,
		type MapFeature,
		type MapPointSymbol,
		type MapSnapshot,
		storedMapSnapshot,
		storeMapSnapshot
	} from '$lib/modules/map/public';
	import type { TripDay } from '$lib/trip/itinerary';

	import { extractGpxXml, gpxMaximumBytes } from '../domain/gpx';
	import {
		type LocationReference,
		type LogbookLeg,
		logbookLegKey,
		logbookLegs,
		logbookLegSchema,
		logbookTotals,
		mooringChoices,
		parseLocation,
		serializeLocation,
		serializeLogbookLeg
	} from '../domain/logbook';
	import LocationInput from './LocationInput.svelte';
	import { editLogbookLegDraft, newLogbookLegDraft } from './logbook-leg-draft';
	import LogbookLegEditor from './LogbookLegEditor.svelte';

	let { day, mapEnabled, timeZone }: { day: TripDay; mapEnabled: boolean; timeZone: string } =
		$props();
	const tripId = $derived(page.data.tripId ?? '');

	let snapshot = $state<MapSnapshot>();
	let locationsReady = $state(false);
	let addingLeg = $state(false);
	let draft = $state(newLogbookLegDraft());

	const legs = $derived(logbookLegs(sharedState.values, day.id));
	const totals = $derived(logbookTotals(legs));
	const destinationKey = $derived(`logbook:day:${day.id}:destination`);
	const weatherKey = $derived(`logbook:day:${day.id}:weather`);
	const notesKey = $derived(`logbook:day:${day.id}:notes`);
	const destination = $derived(parseLocation(sharedState.values[destinationKey]));
	const gpxDateMismatch = $derived(
		draft.gpx !== undefined && localDate(draft.gpx.departureAt) !== day.date
	);
	const points = $derived(
		(snapshot?.features ?? []).filter(
			(
				feature
			): feature is MapFeature & { geometry: { type: 'Point'; coordinates: [number, number] } } =>
				feature.geometry.type === 'Point'
		)
	);
	const destinationSymbols = new Set<MapPointSymbol>(['anchorage', 'buoy-field', 'marina']);
	const destinationPoints = $derived.by(() => {
		const sourceStyleKeys = new Set(
			(snapshot?.sourceStyles ?? [])
				.filter((style) => destinationSymbols.has(style.symbol))
				.map((style) => style.key)
		);
		return points.filter(
			(point) =>
				point.properties.sourceStyleKey !== undefined &&
				sourceStyleKeys.has(point.properties.sourceStyleKey)
		);
	});
	const locationSuggestions = $derived(
		destinationPoints
			.map((point) => ({ id: point.id, name: point.properties.title }))
			.sort((left, right) => left.name.localeCompare(right.name, 'nb-NO'))
	);
	const canSaveLeg = $derived(
		draft.from.trim().length > 0 &&
			draft.to.trim().length > 0 &&
			draft.departure.length > 0 &&
			draft.arrival.length > 0 &&
			draft.nauticalMiles >= 0 &&
			draft.sailingMinutes >= 0 &&
			draft.engineMinutes >= 0 &&
			(draft.mooring !== 'other' || draft.customMooring.trim().length > 0) &&
			(draft.editingKey !== undefined || draft.gpx !== undefined)
	);

	function textValue(key: string): string {
		const value = sharedState.values[key];
		return typeof value === 'string' ? value : '';
	}

	function saveText(key: string, event: Event): void {
		const input = event.currentTarget;
		if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
			void sharedState.set(key, input.value.trim());
		}
	}

	function locationForName(name: string): LocationReference | undefined {
		const trimmed = name.trim();
		if (!trimmed) return undefined;
		const point = destinationPoints.find(
			(feature) =>
				feature.properties.title.toLocaleLowerCase('nb-NO') === trimmed.toLocaleLowerCase('nb-NO')
		);
		return point
			? {
					kind: 'map',
					featureId: point.id,
					name: point.properties.title,
					coordinates: point.geometry.coordinates
				}
			: { kind: 'text', name: trimmed };
	}

	function saveDestination(value: string): void {
		void sharedState.set(destinationKey, serializeLocation(locationForName(value) ?? null));
	}

	function openLeg(): void {
		addingLeg = true;
		draft = newLogbookLegDraft(legs.at(-1)?.to.name ?? destination?.name ?? '');
	}

	function editLeg(key: string, leg: LogbookLeg): void {
		addingLeg = true;
		draft = editLogbookLegDraft(key, leg);
	}

	function localTime(value: string): string {
		return new Intl.DateTimeFormat('nb-NO', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(new Date(value));
	}

	function localDate(value: string): string {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date(value));
	}

	async function checksum(file: File): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
		return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
			''
		);
	}

	function gpxError(error: unknown): string {
		const code = error instanceof Error ? error.message : '';
		if (code === 'GPX_TOO_LARGE') return 'GPX-filen er for stor.';
		if (code === 'GPX_MOVEMENT_REQUIRED') return 'Filen inneholder ingen registrert etappe.';
		if (code === 'GPX_TIMESTAMPS_REQUIRED') return 'GPX-filen mangler tidspunkt.';
		return 'Kunne ikke lese GPX-filen. Velg en GPX-fil eksportert fra Orca.';
	}

	async function importGpx(event: Event): Promise<void> {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) return;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		draft.readingGpx = true;
		draft.error = '';
		try {
			if (file.size > gpxMaximumBytes) throw new Error('GPX_TOO_LARGE');
			const extraction = extractGpxXml(await file.text(), (xml) =>
				new DOMParser().parseFromString(xml, 'text/xml')
			);
			draft.gpx = {
				id: crypto.randomUUID(),
				filename: file.name,
				checksum: await checksum(file),
				byteSize: file.size,
				...extraction
			};
			draft.gpxFile = file;
			draft.departure = localTime(extraction.departureAt);
			draft.arrival = localTime(extraction.arrivalAt);
			draft.nauticalMiles = Number(extraction.nauticalMiles.toFixed(1));
		} catch (error) {
			draft.error = gpxError(error);
		} finally {
			draft.readingGpx = false;
		}
	}

	async function addLeg(): Promise<void> {
		const fromLocation = locationForName(draft.from);
		const toLocation = locationForName(draft.to);
		if (!fromLocation || !toLocation) {
			draft.error = 'Fyll ut både fra og til.';
			return;
		}
		const parsed = logbookLegSchema.safeParse({
			from: fromLocation,
			to: toLocation,
			departure: draft.departure,
			arrival: draft.arrival,
			nauticalMiles: draft.nauticalMiles,
			sailingMinutes: draft.sailingMinutes,
			engineMinutes: draft.engineMinutes,
			mooring: draft.mooring,
			customMooring: draft.mooring === 'other' ? draft.customMooring.trim() : '',
			gpx: draft.gpx,
			createdAt: draft.createdAt || new Date().toISOString(),
			createdBy: draft.createdBy || (await sharedState.clientId()),
			tombstone: false
		});
		if (!parsed.success) {
			draft.error = 'Kontroller tidene og tallene før du lagrer.';
			return;
		}
		const key = draft.editingKey ?? logbookLegKey(day.id, crypto.randomUUID());
		const parsedGpx = parsed.data.gpx;
		if (draft.gpxFile && parsedGpx) {
			const extraction = {
				version: parsedGpx.version,
				name: parsedGpx.name,
				departureAt: parsedGpx.departureAt,
				arrivalAt: parsedGpx.arrivalAt,
				nauticalMiles: parsedGpx.nauticalMiles,
				activeSeconds: parsedGpx.activeSeconds,
				elapsedSeconds: parsedGpx.elapsedSeconds,
				stationarySeconds: parsedGpx.stationarySeconds,
				originalPointCount: parsedGpx.originalPointCount,
				routePointCount: parsedGpx.routePointCount,
				segments: parsedGpx.segments,
				stationaryBlocks: parsedGpx.stationaryBlocks,
				recordingGaps: parsedGpx.recordingGaps
			};
			await sharedState.setWithUpload(key, serializeLogbookLeg(parsed.data), {
				id: parsedGpx.id,
				moduleId: 'logbook',
				relatedStateKey: key,
				path: `/api/logbook/gpx/${encodeURIComponent(parsedGpx.id)}`,
				query: { legKey: key, filename: parsedGpx.filename },
				contentType: 'application/gpx+xml',
				data: draft.gpxFile,
				createdAt: Date.now(),
				expectedResponse: {
					checksum: parsedGpx.checksum,
					parserVersion: parsedGpx.version,
					extraction
				}
			});
		} else {
			await sharedState.set(key, serializeLogbookLeg(parsed.data));
		}
		addingLeg = false;
	}

	function deleteLeg(key: string, leg: LogbookLeg): void {
		void sharedState.set(key, serializeLogbookLeg({ ...leg, tombstone: true }));
	}

	function useLatestDestination(): void {
		const latest = legs.at(-1)?.to;
		if (latest) void sharedState.set(destinationKey, serializeLocation(latest));
	}

	function duration(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return hours > 0 ? `${hours} t ${rest} min` : `${rest} min`;
	}

	function durationSeconds(seconds: number): string {
		return duration(Math.round(seconds / 60));
	}

	function mooringLabel(leg: LogbookLeg): string {
		return leg.mooring === 'other'
			? leg.customMooring
			: (mooringChoices.find((choice) => choice.value === leg.mooring)?.label ?? leg.mooring);
	}

	onMount((): void => {
		void (async (): Promise<void> => {
			try {
				if (!mapEnabled) return;
				const cached = await storedMapSnapshot(tripId);
				snapshot = cached?.value;
				if (!navigator.onLine) {
					return;
				}
				try {
					const map = await apiRequest<MapApiResponse>('/api/map');
					snapshot = map.snapshot;
					await storeMapSnapshot(tripId, map.snapshot);
				} catch {
					return;
				}
			} finally {
				locationsReady = true;
			}
		})();
	});
</script>

<div class="space-y-7">
	<section class="grid gap-4 sm:grid-cols-2">
		<div class="sm:col-span-2">
			{#if sharedState.ready && locationsReady}
				{#key `${day.index}:${destination?.name ?? ''}`}
					<LocationInput
						label="Dagens destinasjon"
						value={destination?.name ?? ''}
						suggestions={locationSuggestions}
						placeholder="Velg kartpunkt eller skriv et sted"
						oncommit={saveDestination}
					/>
				{/key}
			{:else}
				<label class="block">
					<span class="mb-1 block font-semibold">Dagens destinasjon</span>
					<input class="input w-full bg-base-100" disabled value="Laster …" />
				</label>
			{/if}
		</div>
		<label class="block">
			<span class="mb-1 block font-semibold">Vær og vind</span>
			<input
				class="input w-full bg-base-100"
				placeholder="Sol, 6 m/s fra nordvest"
				value={textValue(weatherKey)}
				onchange={(event) => saveText(weatherKey, event)}
			/>
		</label>
		<label class="block">
			<span class="mb-1 block font-semibold">Notater</span>
			<textarea
				class="textarea min-h-24 w-full bg-base-100"
				placeholder="Dagens små og store hendelser"
				value={textValue(notesKey)}
				onchange={(event) => saveText(notesKey, event)}></textarea>
		</label>
	</section>

	<section class="border-t border-base-300 pt-6">
		<div class="mb-4 flex items-end justify-between gap-4">
			<div>
				<h2 class="font-display text-xl font-bold">Etapper</h2>
				<p class="mt-1 text-sm text-base-content/55">Seilaser og forflytninger denne dagen.</p>
			</div>
			<button
				class="btn btn-primary btn-sm"
				type="button"
				disabled={!sharedState.ready}
				onclick={openLeg}><CirclePlus size={17} />Ny etappe</button
			>
		</div>
		{#if legs.length > 0}
			<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				<div class="rounded-lg bg-base-100 p-3">
					<small>Etapper</small><strong class="block text-lg">{totals.legCount}</strong>
				</div>
				<div class="rounded-lg bg-base-100 p-3">
					<small>Nautiske mil</small><strong class="block text-lg"
						>{totals.nauticalMiles.toLocaleString('nb-NO', { maximumFractionDigits: 1 })}</strong
					>
				</div>
				<div class="rounded-lg bg-base-100 p-3">
					<small>Seiling</small><strong class="block text-lg"
						>{duration(totals.sailingMinutes)}</strong
					>
				</div>
				<div class="rounded-lg bg-base-100 p-3">
					<small>Motor</small><strong class="block text-lg">{duration(totals.engineMinutes)}</strong
					>
				</div>
			</div>
			{#if destination?.name !== legs.at(-1)?.to.name}
				<button class="btn mb-3 w-full btn-sm" type="button" onclick={useLatestDestination}
					>Bruk {legs.at(-1)?.to.name} som dagens destinasjon</button
				>
			{/if}
		{/if}
		<div class="space-y-2">
			{#each legs as leg (leg.key)}
				<article class="rounded-lg border border-base-300 bg-base-100 p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<h3 class="font-semibold">{leg.from.name} → {leg.to.name}</h3>
							<p class="mt-1 text-sm text-base-content/60">
								{leg.departure}–{leg.arrival} · {leg.nauticalMiles.toLocaleString('nb-NO')} nm · {mooringLabel(
									leg
								)}
							</p>
						</div>
						<div class="flex shrink-0">
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								onclick={() => editLeg(leg.key, leg)}
								aria-label="Rediger etappe"
								title="Rediger etappe"><Pencil size={17} /></button
							>
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								onclick={() => deleteLeg(leg.key, leg)}
								aria-label="Slett etappe"
								title="Slett etappe"><Trash2 size={17} /></button
							>
						</div>
					</div>
					<div class="mt-3 flex gap-4 text-xs text-base-content/55">
						<span>Seil {duration(leg.sailingMinutes)}</span><span
							>Motor {duration(leg.engineMinutes)}</span
						>
					</div>
					{#if leg.gpx}
						<div
							class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/55"
						>
							<span class="flex items-center gap-1.5"
								><FileCheck2 size={14} />{leg.gpx.filename}</span
							>
							<span>Aktiv {durationSeconds(leg.gpx.activeSeconds)}</span>
							<span
								>{sharedState.isUploadPending(leg.gpx.id)
									? 'Venter på opplasting'
									: 'GPX lagret'}</span
							>
						</div>
					{/if}
				</article>
			{:else}<p
					class="rounded-lg border border-dashed border-base-300 p-5 text-center text-sm text-base-content/55"
				>
					Ingen etapper denne dagen.
				</p>{/each}
		</div>
	</section>
</div>

{#if addingLeg}
	<LogbookLegEditor
		{draft}
		{locationSuggestions}
		dateMismatch={gpxDateMismatch}
		canSave={canSaveLeg}
		formatTime={localTime}
		formatDuration={durationSeconds}
		onimport={importGpx}
		onsave={addLeg}
		onclose={() => (addingLeg = false)}
	/>
{/if}
