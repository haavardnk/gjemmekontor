<script lang="ts">
	import { Plane, Plus, Trash2 } from '@lucide/svelte';

	import EndpointFields from './EndpointFields.svelte';
	import type { EditableItineraryLeg, FlightCandidate } from './itinerary-editor';

	let {
		legs,
		returnJourney,
		online,
		lookupLoading,
		lookupLegId,
		lookupError,
		lookupCandidates,
		manualLegIds,
		googlePlacesApiKey,
		removeLeg,
		updateDepartureDate,
		lookupFlight,
		applyFlightCandidate,
		toggleManualLeg,
		addFlightLeg
	}: {
		legs: EditableItineraryLeg[];
		returnJourney: boolean;
		online: boolean;
		lookupLoading: boolean;
		lookupLegId?: string;
		lookupError: string;
		lookupCandidates: FlightCandidate[];
		manualLegIds: string[];
		googlePlacesApiKey: string;
		removeLeg: (index: number) => void;
		updateDepartureDate: (leg: EditableItineraryLeg, date: string) => void;
		lookupFlight: (leg: EditableItineraryLeg) => void;
		applyFlightCandidate: (candidate: FlightCandidate, legId: string) => void;
		toggleManualLeg: (legId: string) => void;
		addFlightLeg: () => void;
	} = $props();
</script>

<section class="space-y-4">
	<p class="text-sm text-base-content/55">
		{returnJourney
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
					disabled={!online || (lookupLoading && lookupLegId === leg.id)}
					title={!online ? 'Flydata krever nett' : 'Hent flydata'}
					onclick={() => lookupFlight(leg)}
					>{lookupLoading && lookupLegId === leg.id ? 'Henter …' : 'Hent flydata'}</button
				>
			</div>
			{#if leg.provider}<div class="mt-3 rounded-xl border border-success/30 bg-success/5 p-3">
					<p class="font-semibold">
						{leg.serviceNumber} · {leg.from.locationCode || leg.from.locationName} → {leg.to
							.locationCode || leg.to.locationName}
					</p>
					<p class="mt-1 text-xs text-base-content/60">
						{leg.from.localDateTime.replace('T', ' ')} – {leg.to.localDateTime.replace('T', ' ')}
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
										><strong>{candidate.flightNumber}</strong> · {candidate.from.locationCode}
										{candidate.from.localDateTime.replace('T', ' ')} → {candidate.to.locationCode}
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
