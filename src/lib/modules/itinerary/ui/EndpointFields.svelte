<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import type { EditableItineraryEndpoint } from '../domain/itinerary';
	import PlaceInput from './PlaceInput.svelte';
	import TimeZoneSelect from './TimeZoneSelect.svelte';

	let {
		endpoint = $bindable(),
		label,
		travelDetails = false,
		placeLabel = 'Sted',
		googlePlacesApiKey = ''
	}: {
		endpoint: EditableItineraryEndpoint;
		label: string;
		travelDetails?: boolean;
		placeLabel?: string;
		googlePlacesApiKey?: string;
	} = $props();
</script>

<fieldset class="rounded-xl border border-base-300 p-3">
	<legend class="px-1 text-sm font-bold">{label}</legend>
	<div class="grid gap-3 sm:grid-cols-2">
		<div class:sm:col-span-2={!travelDetails}>
			<PlaceInput
				label={placeLabel}
				bind:value={endpoint.locationName}
				apiKey={googlePlacesApiKey}
				compact={true}
			/>
		</div>
		{#if travelDetails}
			<label class="block">
				<span class="mb-1 block text-sm font-semibold">Kode</span>
				<input
					class="input w-full uppercase input-sm"
					bind:value={endpoint.locationCode}
					maxlength="12"
					placeholder="OSL"
				/>
			</label>
		{/if}
		<label class="block sm:col-span-2">
			<span class="mb-1 block text-sm font-semibold">Dato og tid</span>
			<input
				class="input w-full input-sm"
				type="datetime-local"
				bind:value={endpoint.localDateTime}
				required
			/>
		</label>
	</div>
	<details class="group mt-3 border-t border-base-300 pt-2">
		<summary
			class="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-base-content/55"
		>
			<ChevronDown class="transition-transform group-open:rotate-180" size={14} />
			Tidssone og detaljer
		</summary>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class:sm:col-span-2={!travelDetails}>
				<TimeZoneSelect bind:value={endpoint.timeZone} at={endpoint.localDateTime} />
			</div>
			{#if travelDetails}
				<label class="block">
					<span class="mb-1 block text-sm font-semibold">Terminal</span>
					<input class="input w-full input-sm" bind:value={endpoint.terminal} maxlength="50" />
				</label>
				<label class="block">
					<span class="mb-1 block text-sm font-semibold">Gate / spor</span>
					<input
						class="input w-full input-sm"
						value={endpoint.gate || endpoint.platform}
						maxlength="50"
						oninput={(event) => {
							const value = event.currentTarget.value;
							endpoint.gate = value;
							endpoint.platform = value;
						}}
					/>
				</label>
			{/if}
		</div>
	</details>
</fieldset>
