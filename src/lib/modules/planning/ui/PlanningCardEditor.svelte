<script lang="ts">
	import { Plus, Trash2, X } from '@lucide/svelte';
	import { untrack } from 'svelte';

	import { PlaceInput, type PlaceSelection } from '$lib/modules/map/public';

	import type { PlanningCardDraft } from '../domain/inputs';
	import { type PlanningCard, type PlanningCategory, planningLimits } from '../domain/planning';

	let {
		card,
		categories,
		defaultCategoryId,
		personId,
		googlePlacesApiKey,
		online,
		saving,
		errorMessage,
		onsave,
		onclose
	}: {
		card?: PlanningCard;
		categories: PlanningCategory[];
		defaultCategoryId: string | null;
		personId: string;
		googlePlacesApiKey: string;
		online: boolean;
		saving: boolean;
		errorMessage: string;
		onsave: (draft: PlanningCardDraft) => Promise<void>;
		onclose: () => void;
	} = $props();

	const seed = untrack(() => ({
		card: $state.snapshot(card),
		categoryId: defaultCategoryId
	}));
	let title = $state(seed.card?.title ?? '');
	let body = $state(seed.card?.body ?? '');
	let categoryId = $state(seed.card ? (seed.card.categoryId ?? '') : (seed.categoryId ?? ''));
	let placeLabel = $state(seed.card?.place?.label ?? '');
	let selectedPlace = $state<PlaceSelection | null>(
		seed.card?.place && seed.card.place.lat !== null && seed.card.place.lng !== null
			? {
					label: seed.card.place.label,
					lat: seed.card.place.lat,
					lng: seed.card.place.lng,
					placeId: seed.card.place.googlePlaceId ?? ''
				}
			: null
	);
	let checklist = $state(
		(seed.card?.checklist ?? []).map(({ id, text, checked }) => ({ id, text, checked }))
	);
	let newItemText = $state('');

	function addItem(): void {
		const text = newItemText.trim();
		if (!text || checklist.length >= planningLimits.checklistItems) return;
		checklist = [...checklist, { id: crypto.randomUUID(), text, checked: false }];
		newItemText = '';
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const label = placeLabel.trim();
		const place = label
			? selectedPlace?.label === placeLabel
				? {
						label,
						lat: selectedPlace.lat,
						lng: selectedPlace.lng,
						googlePlaceId: selectedPlace.placeId || null
					}
				: { label, lat: null, lng: null, googlePlaceId: null }
			: null;
		await onsave({
			personId,
			categoryId: categoryId || null,
			title,
			body,
			place,
			checklist: checklist.filter((item) => item.text.trim())
		});
	}
</script>

<div
	class="modal modal-open z-100 p-0 sm:p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="planning-card-editor-title"
>
	<form
		class="modal-box flex h-dvh max-h-dvh w-full max-w-2xl flex-col rounded-none p-0 sm:h-auto sm:max-h-[94dvh] sm:rounded-box"
		onsubmit={submit}
	>
		<header
			class="shrink-0 border-b border-base-300 bg-base-100 px-4 pb-3 sm:px-6 sm:pt-5"
			style="padding-top: max(1rem, env(safe-area-inset-top));"
		>
			<div class="flex items-center justify-between gap-4">
				<h2 id="planning-card-editor-title" class="font-display text-2xl font-bold">
					{card ? 'Rediger kort' : 'Nytt kort'}
				</h2>
				<button
					class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
					type="button"
					disabled={saving}
					onclick={onclose}
					aria-label="Lukk skjemaet"><X size={21} /></button
				>
			</div>
		</header>

		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
			<label class="block">
				<span class="label-text mb-1 block font-semibold">Tittel</span>
				<input
					class="input-bordered input w-full"
					bind:value={title}
					maxlength={planningLimits.title}
					autocomplete="off"
					required
				/>
			</label>
			<label class="block">
				<span class="label-text mb-1 block font-semibold">Kategori</span>
				<select class="select-bordered select w-full" bind:value={categoryId}>
					<option value="">Usortert</option>
					{#each categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</label>
			<label class="block">
				<span class="label-text mb-1 block font-semibold">Notat</span>
				<textarea
					class="textarea-bordered textarea min-h-32 w-full"
					bind:value={body}
					maxlength={planningLimits.body}></textarea>
			</label>
			<PlaceInput
				label="Sted"
				bind:value={placeLabel}
				apiKey={googlePlacesApiKey}
				required={false}
				onselect={(place) => {
					selectedPlace = place;
				}}
			/>
			<fieldset class="space-y-2">
				<legend class="label-text mb-1 font-semibold">Sjekkliste</legend>
				{#each checklist as item, index (item.id)}
					<div class="flex items-center gap-2">
						<input
							class="checkbox checkbox-sm"
							type="checkbox"
							bind:checked={item.checked}
							aria-label={`Ferdig: ${item.text}`}
						/>
						<input
							class="input-bordered input min-w-0 flex-1 input-sm"
							bind:value={item.text}
							maxlength={planningLimits.checklistText}
							aria-label={`Punkt ${index + 1}`}
						/>
						<button
							class="btn btn-square btn-ghost btn-sm"
							type="button"
							onclick={() => {
								checklist = checklist.filter(({ id }) => id !== item.id);
							}}
							aria-label={`Fjern ${item.text}`}><Trash2 size={16} /></button
						>
					</div>
				{/each}
				<div class="flex items-center gap-2">
					<input
						class="input-bordered input min-w-0 flex-1 input-sm"
						bind:value={newItemText}
						maxlength={planningLimits.checklistText}
						placeholder="Nytt punkt"
						aria-label="Nytt punkt"
						onkeydown={(event) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							addItem();
						}}
					/>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						disabled={!newItemText.trim() || checklist.length >= planningLimits.checklistItems}
						onclick={addItem}
						aria-label="Legg til punkt"><Plus size={18} /></button
					>
				</div>
			</fieldset>
			{#if errorMessage}<p class="text-sm text-error" role="alert">{errorMessage}</p>{/if}
		</div>

		<footer
			class="flex shrink-0 justify-end gap-2 border-t border-base-300 bg-base-100 px-4 pt-3 sm:px-6 sm:pb-5"
			style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
		>
			<button class="btn btn-ghost" type="button" disabled={saving} onclick={onclose}>Avbryt</button
			>
			<button class="btn btn-primary" type="submit" disabled={!online || saving || !title.trim()}
				>Lagre</button
			>
		</footer>
	</form>
</div>
