<script lang="ts">
	import { Users } from '@lucide/svelte';

	import type { ItineraryMember } from '$lib/modules/itinerary/server/members';

	let {
		members,
		selectedParticipants,
		bookingReference = $bindable(),
		bookingUrl = $bindable(),
		notes = $bindable(),
		ontoggleParticipant
	}: {
		members: ItineraryMember[];
		selectedParticipants: string[];
		bookingReference: string;
		bookingUrl: string;
		notes: string;
		ontoggleParticipant: (name: string) => void;
	} = $props();
</script>

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
					onclick={() => ontoggleParticipant(member.name)}><Users size={14} /> {member.name}</button
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
