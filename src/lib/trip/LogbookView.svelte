<script lang="ts">
	import { CirclePlus, FileCheck2, FileUp, Pencil, RefreshCw, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { sharedState } from '$lib/client/state.svelte';
	import { storedMapSnapshot, storeMapSnapshot } from '$lib/map/offline';
	import type { MapApiResponse, MapFeature, MapPointSymbol, MapSnapshot } from '$lib/map/types';

	import type { TripDay } from './days';
	import { extractGpxXml, gpxMaximumBytes } from './gpx';
	import LocationInput from './LocationInput.svelte';
	import {
		type LocationReference,
		type LogbookGpx,
		type LogbookLeg,
		logbookLegKey,
		logbookLegs,
		logbookLegSchema,
		logbookTotals,
		mooringChoices,
		parseLocation,
		serializeLocation,
		serializeLogbookLeg
	} from './logbook';

	let { day }: { day: TripDay } = $props();

	let snapshot = $state<MapSnapshot>();
	let locationsReady = $state(false);
	let addingLeg = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let editingKey = $state<string>();
	let editingCreatedAt = $state('');
	let editingCreatedBy = $state('');
	let from = $state('');
	let to = $state('');
	let departure = $state('09:00');
	let arrival = $state('12:00');
	let nauticalMiles = $state(0);
	let sailingMinutes = $state(0);
	let engineMinutes = $state(0);
	let mooring = $state<(typeof mooringChoices)[number]['value']>('anchor');
	let customMooring = $state('');
	let gpx = $state<LogbookGpx>();
	let gpxFile = $state<File>();
	let readingGpx = $state(false);
	let formError = $state('');

	const legs = $derived(logbookLegs(sharedState.values, day.index));
	const totals = $derived(logbookTotals(legs));
	const destinationKey = $derived(`logbook:d${day.index}:destination`);
	const weatherKey = $derived(`logbook:d${day.index}:weather`);
	const notesKey = $derived(`logbook:d${day.index}:notes`);
	const destination = $derived(parseLocation(sharedState.values[destinationKey]));
	const gpxDateMismatch = $derived(gpx !== undefined && localDate(gpx.departureAt) !== day.date);
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
		from.trim().length > 0 &&
			to.trim().length > 0 &&
			departure.length > 0 &&
			arrival.length > 0 &&
			nauticalMiles >= 0 &&
			sailingMinutes >= 0 &&
			engineMinutes >= 0 &&
			(mooring !== 'other' || customMooring.trim().length > 0) &&
			(editingKey !== undefined || gpx !== undefined)
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
		editingKey = undefined;
		editingCreatedAt = '';
		editingCreatedBy = '';
		from = legs.at(-1)?.to.name ?? destination?.name ?? '';
		to = '';
		departure = '09:00';
		arrival = '12:00';
		nauticalMiles = 0;
		sailingMinutes = 0;
		engineMinutes = 0;
		mooring = 'anchor';
		customMooring = '';
		gpx = undefined;
		gpxFile = undefined;
		readingGpx = false;
		formError = '';
	}

	function editLeg(key: string, leg: LogbookLeg): void {
		addingLeg = true;
		editingKey = key;
		editingCreatedAt = leg.createdAt;
		editingCreatedBy = leg.createdBy;
		from = leg.from.name;
		to = leg.to.name;
		departure = leg.departure;
		arrival = leg.arrival;
		nauticalMiles = leg.nauticalMiles;
		sailingMinutes = leg.sailingMinutes;
		engineMinutes = leg.engineMinutes;
		mooring = leg.mooring;
		customMooring = leg.customMooring;
		gpx = leg.gpx;
		gpxFile = undefined;
		readingGpx = false;
		formError = '';
	}

	function localTime(value: string): string {
		return new Intl.DateTimeFormat('nb-NO', {
			timeZone: 'Europe/Zagreb',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(new Date(value));
	}

	function localDate(value: string): string {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Zagreb',
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
		readingGpx = true;
		formError = '';
		try {
			if (file.size > gpxMaximumBytes) throw new Error('GPX_TOO_LARGE');
			const extraction = extractGpxXml(await file.text(), (xml) =>
				new DOMParser().parseFromString(xml, 'text/xml')
			);
			gpx = {
				id: crypto.randomUUID(),
				filename: file.name,
				checksum: await checksum(file),
				byteSize: file.size,
				...extraction
			};
			gpxFile = file;
			departure = localTime(extraction.departureAt);
			arrival = localTime(extraction.arrivalAt);
			nauticalMiles = Number(extraction.nauticalMiles.toFixed(1));
		} catch (error) {
			formError = gpxError(error);
		} finally {
			readingGpx = false;
		}
	}

	async function addLeg(): Promise<void> {
		const fromLocation = locationForName(from);
		const toLocation = locationForName(to);
		if (!fromLocation || !toLocation) {
			formError = 'Fyll ut både fra og til.';
			return;
		}
		const parsed = logbookLegSchema.safeParse({
			from: fromLocation,
			to: toLocation,
			departure,
			arrival,
			nauticalMiles,
			sailingMinutes,
			engineMinutes,
			mooring,
			customMooring: mooring === 'other' ? customMooring.trim() : '',
			gpx,
			createdAt: editingCreatedAt || new Date().toISOString(),
			createdBy: editingCreatedBy || (await sharedState.clientId()),
			tombstone: false
		});
		if (!parsed.success) {
			formError = 'Kontroller tidene og tallene før du lagrer.';
			return;
		}
		const key = editingKey ?? logbookLegKey(day.index, crypto.randomUUID());
		const parsedGpx = parsed.data.gpx;
		if (gpxFile && parsedGpx) {
			await sharedState.setWithGpx(key, serializeLogbookLeg(parsed.data), {
				id: parsedGpx.id,
				legKey: key,
				filename: parsedGpx.filename,
				contentType: 'application/gpx+xml',
				checksum: parsedGpx.checksum,
				data: gpxFile,
				createdAt: Date.now(),
				parserVersion: parsedGpx.version,
				extraction: {
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
				const cached = await storedMapSnapshot();
				snapshot = cached?.value;
				if (!navigator.onLine) {
					return;
				}
				try {
					const response = await fetch('/api/map');
					if (!response.ok) {
						return;
					}
					const map = (await response.json()) as MapApiResponse;
					snapshot = map.snapshot;
					await storeMapSnapshot(map.snapshot);
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
								>{sharedState.isGpxUploadPending(leg.gpx.id)
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
	<div class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="add-leg-title">
		<div class="modal-box max-w-xl">
			<h2 id="add-leg-title" class="font-display text-2xl font-bold">
				{editingKey ? 'Rediger etappe' : 'Ny etappe'}
			</h2>
			<input
				class="hidden"
				type="file"
				accept=".gpx,application/gpx+xml"
				bind:this={fileInput}
				onchange={importGpx}
			/>
			<section class="mt-4 rounded-lg border border-base-300 bg-base-200 p-4">
				{#if gpx}
					<div class="flex items-start gap-3">
						<FileCheck2 class="mt-0.5 shrink-0 text-success" size={21} />
						<div class="min-w-0 flex-1">
							<p class="truncate font-semibold">{gpx.filename}</p>
							<p class="mt-1 text-sm text-base-content/65">
								{localTime(gpx.departureAt)}–{localTime(gpx.arrivalAt)} · {gpx.nauticalMiles.toLocaleString(
									'nb-NO',
									{ maximumFractionDigits: 1 }
								)} nm
							</p>
							<p class="mt-1 text-xs text-base-content/55">
								Aktiv {durationSeconds(gpx.activeSeconds)} · Totalt {durationSeconds(
									gpx.elapsedSeconds
								)} · {durationSeconds(gpx.stationarySeconds)} uten bevegelse fjernet
							</p>
						</div>
						<button
							class="btn btn-square btn-ghost btn-sm"
							type="button"
							disabled={readingGpx}
							onclick={() => fileInput?.click()}
							aria-label="Bytt GPX-fil"
							title="Bytt GPX-fil"><RefreshCw size={17} /></button
						>
					</div>
					{#if gpxDateMismatch}
						<p class="mt-3 text-sm text-warning" role="alert">
							Datoen i GPX-filen er en annen enn valgt dag. Kontroller at etappen ligger riktig.
						</p>
					{/if}
				{:else}
					<div class="text-center">
						<FileUp class="mx-auto text-primary" size={28} />
						<p class="mt-2 font-semibold">Legg til GPX fra Orca</p>
						<p class="mt-1 text-sm text-base-content/60">
							Etappen, tidene og distansen hentes fra filen.
						</p>
						<button
							class="btn mt-3 btn-primary btn-sm"
							type="button"
							disabled={readingGpx}
							onclick={() => fileInput?.click()}
							><FileUp size={16} />{readingGpx ? 'Leser GPX …' : 'Velg GPX-fil'}</button
						>
					</div>
				{/if}
			</section>
			{#if gpx || editingKey}
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<LocationInput label="Fra" bind:value={from} suggestions={locationSuggestions} />
					<LocationInput label="Til" bind:value={to} suggestions={locationSuggestions} />
					<label class="block"
						><span class="mb-1 block font-semibold">Avgang</span><input
							class="input w-full"
							type="time"
							readonly={gpx !== undefined}
							bind:value={departure}
						/></label
					>
					<label class="block"
						><span class="mb-1 block font-semibold">Ankomst</span><input
							class="input w-full"
							type="time"
							readonly={gpx !== undefined}
							bind:value={arrival}
						/></label
					>
					<label class="block"
						><span class="mb-1 block font-semibold">Nautiske mil</span><input
							class="input w-full"
							type="number"
							min="0"
							max="500"
							step="0.1"
							readonly={gpx !== undefined}
							bind:value={nauticalMiles}
						/></label
					>
					<label class="block"
						><span class="mb-1 block font-semibold">Fortøyning</span><select
							class="select w-full"
							bind:value={mooring}
							>{#each mooringChoices as choice (choice.value)}<option value={choice.value}
									>{choice.label}</option
								>{/each}</select
						></label
					>
					<label class="block"
						><span class="mb-1 block font-semibold">Seiling, minutter</span><input
							class="input w-full"
							type="number"
							min="0"
							max="1440"
							bind:value={sailingMinutes}
						/></label
					>
					<label class="block"
						><span class="mb-1 block font-semibold">Motor, minutter</span><input
							class="input w-full"
							type="number"
							min="0"
							max="1440"
							bind:value={engineMinutes}
						/></label
					>
					{#if mooring === 'other'}<label class="block sm:col-span-2"
							><span class="mb-1 block font-semibold">Fortøyningstype</span><input
								class="input w-full"
								bind:value={customMooring}
								maxlength="100"
							/></label
						>{/if}
				</div>
			{/if}
			{#if formError}<p class="mt-3 text-sm text-error" role="alert">{formError}</p>{/if}
			<div class="modal-action">
				<button class="btn" type="button" onclick={() => (addingLeg = false)}>Avbryt</button><button
					class="btn btn-primary"
					type="button"
					disabled={!canSaveLeg}
					onclick={addLeg}>{editingKey ? 'Lagre endringer' : 'Lagre etappe'}</button
				>
			</div>
		</div>
		<button
			class="modal-backdrop"
			type="button"
			onclick={() => (addingLeg = false)}
			aria-label="Lukk"
		></button>
	</div>
{/if}
