<script lang="ts">
	import type { EditableItineraryEndpoint } from '../domain/itinerary';
	import EndpointFields from './EndpointFields.svelte';
	import type { ItineraryEntryType } from './itinerary-editor';
	import PlaceInput from './PlaceInput.svelte';
	import TimeZoneSelect from './TimeZoneSelect.svelte';

	let {
		entryType,
		title = $bindable(),
		primary = $bindable(),
		secondary = $bindable(),
		staySubtype = $bindable(),
		rentalSubtype = $bindable(),
		bookingSubtype = $bindable(),
		bookingHasEnd = $bindable(),
		googlePlacesApiKey
	}: {
		entryType: ItineraryEntryType;
		title: string;
		primary: EditableItineraryEndpoint;
		secondary: EditableItineraryEndpoint;
		staySubtype: 'hotel' | 'holiday-rental' | 'camping' | 'other';
		rentalSubtype: 'car' | 'boat' | 'bike' | 'equipment' | 'other';
		bookingSubtype: 'activity' | 'restaurant' | 'event' | 'appointment' | 'other';
		bookingHasEnd: boolean;
		googlePlacesApiKey: string;
	} = $props();
</script>

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
		placeholder="Sted"
	/><label class="block"
		><span class="mb-1 block font-semibold">Type</span><select
			class="select w-full"
			bind:value={staySubtype}
			><option value="hotel">Hotell</option><option value="holiday-rental"
				>Airbnb / feriebolig</option
			><option value="camping">Camping</option><option value="other">Annet</option></select
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
		<summary class="cursor-pointer text-sm font-semibold text-base-content/60">Tidssone</summary>
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
			><option value="car">Bil</option><option value="boat">Båt</option><option value="bike"
				>Sykkel / scooter</option
			><option value="equipment">Utstyr</option><option value="other">Annet</option></select
		></label
	>
	<div class="grid gap-4 lg:grid-cols-2">
		<EndpointFields label="Henting" bind:endpoint={primary} {googlePlacesApiKey} /><EndpointFields
			label="Levering"
			bind:endpoint={secondary}
			{googlePlacesApiKey}
		/>
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
			><input class="checkbox checkbox-primary" type="checkbox" bind:checked={bookingHasEnd} /><span
				class="font-semibold">Har sluttid</span
			></label
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
{:else}<EndpointFields label="Tid og sted" bind:endpoint={primary} {googlePlacesApiKey} />{/if}
