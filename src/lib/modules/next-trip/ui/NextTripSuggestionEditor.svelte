<script lang="ts">
	import type { NextTripSuggestion } from '../domain/next-trip';

	let {
		suggestion,
		online,
		saving,
		errorMessage,
		onsave,
		onclose
	}: {
		suggestion?: NextTripSuggestion;
		online: boolean;
		saving: boolean;
		errorMessage: string;
		onsave: (draft: { destination: string; note: string; url: string }) => Promise<void>;
		onclose: () => void;
	} = $props();

	let destination = $derived(suggestion?.destination ?? '');
	let note = $derived(suggestion?.note ?? '');
	let url = $derived(suggestion?.url ?? '');

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await onsave({ destination, note, url });
	}
</script>

<div class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="suggestion-heading">
	<div class="modal-box">
		<div class="flex items-start justify-between gap-4">
			<h2 id="suggestion-heading" class="font-display text-2xl">
				{suggestion ? 'Rediger reiseforslag' : 'Nytt reiseforslag'}
			</h2>
			<button class="btn btn-ghost btn-sm" type="button" disabled={saving} onclick={onclose}
				>Lukk</button
			>
		</div>
		<form class="mt-4 space-y-3" onsubmit={submit}>
			<label class="flex flex-col gap-1">
				<span class="label-text">Hvor?</span>
				<input class="input-bordered input" bind:value={destination} required maxlength="200" />
			</label>
			<label class="flex flex-col gap-1">
				<span class="label-text">Hvorfor?</span>
				<textarea class="textarea-bordered textarea min-h-20" bind:value={note} maxlength="1000"
				></textarea>
			</label>
			<label class="flex flex-col gap-1">
				<span class="label-text">Lenke</span>
				<input class="input-bordered input" type="url" bind:value={url} placeholder="https://" />
			</label>
			<button
				class="btn w-full btn-primary"
				type="submit"
				disabled={!online || saving || !destination.trim()}
			>
				{suggestion ? 'Lagre endringer' : 'Legg til forslag'}
			</button>
		</form>
		{#if errorMessage}<p class="mt-3 text-sm text-error" role="alert">{errorMessage}</p>{/if}
	</div>
	<button class="modal-backdrop" type="button" disabled={saving} onclick={onclose}>Lukk</button>
</div>
