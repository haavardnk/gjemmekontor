<script lang="ts">
	import EndpointFields from './EndpointFields.svelte';
	import type {
		EditableItineraryLeg,
		ItineraryEntryType,
		TransportEntryType
	} from './itinerary-editor';
	import PlaceInput from './PlaceInput.svelte';
	import TimeZoneSelect from './TimeZoneSelect.svelte';

	let {
		entryType = $bindable(),
		legs,
		googlePlacesApiKey
	}: {
		entryType: ItineraryEntryType;
		legs: EditableItineraryLeg[];
		googlePlacesApiKey: string;
	} = $props();
	const transportChoices: { value: TransportEntryType; label: string }[] = [
		{ value: 'taxi', label: 'Taxi' },
		{ value: 'train', label: 'Tog' },
		{ value: 'bus', label: 'Buss' },
		{ value: 'ferry', label: 'Ferge / båt' },
		{ value: 'transfer', label: 'Privat transport' },
		{ value: 'other-transport', label: 'Annen transport' }
	];
	const leg = $derived(legs[0]!);
</script>

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
		<PlaceInput label="Hentested" bind:value={leg.from.locationName} apiKey={googlePlacesApiKey} />
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
		<summary class="cursor-pointer text-sm font-semibold text-base-content/60">Tidssone</summary>
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
		<EndpointFields label="Fra" bind:endpoint={leg.from} {googlePlacesApiKey} /><EndpointFields
			label="Til"
			bind:endpoint={leg.to}
			{googlePlacesApiKey}
		/>
	</div>
{/if}
