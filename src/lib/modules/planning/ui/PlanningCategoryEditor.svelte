<script lang="ts">
	import { X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import ModalDialog from '$lib/ui/ModalDialog.svelte';

	import type { PlanningCategoryInput } from '../domain/inputs';
	import {
		type PlanningCategory,
		type PlanningCategoryColor,
		planningCategoryColors,
		planningLimits
	} from '../domain/planning';
	import { planningColorStyles } from './planning-colors';

	let {
		category,
		online,
		saving,
		errorMessage,
		onsave,
		onclose
	}: {
		category?: PlanningCategory;
		online: boolean;
		saving: boolean;
		errorMessage: string;
		onsave: (draft: PlanningCategoryInput) => Promise<void>;
		onclose: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>(undefined!);
	let name = $derived(category?.name ?? '');
	let color = $derived<PlanningCategoryColor>(category?.color ?? 'sky');

	onMount(() => dialog.showModal());

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await onsave({ name, color });
	}
</script>

<ModalDialog
	bind:dialog
	modalClass="modal modal-bottom sm:modal-middle"
	boxClass="modal-box max-w-md rounded-t-2xl sm:rounded-box"
	labelledBy="planning-category-title"
	closeLabel="Lukk kategorien"
	closeDisabled={saving}
	{onclose}
>
	<form class="space-y-4" onsubmit={submit}>
		<div class="flex items-center justify-between gap-3">
			<h2 id="planning-category-title" class="font-display text-2xl font-bold">
				{category ? 'Rediger kategori' : 'Ny kategori'}
			</h2>
			<button
				class="btn btn-square btn-ghost btn-sm"
				type="button"
				disabled={saving}
				onclick={() => dialog.close()}
				aria-label="Lukk"><X size={19} /></button
			>
		</div>
		<label class="block">
			<span class="label-text mb-1 block font-semibold">Navn</span>
			<input
				class="input-bordered input w-full"
				bind:value={name}
				maxlength={planningLimits.categoryName}
				autocomplete="off"
				required
			/>
		</label>
		<fieldset>
			<legend class="label-text mb-2 font-semibold">Farge</legend>
			<div class="flex flex-wrap gap-2">
				{#each planningCategoryColors as option (option)}
					<label
						class="grid h-11 w-11 cursor-pointer place-items-center rounded-full border-2 border-transparent has-checked:border-base-content"
					>
						<input
							class="sr-only"
							type="radio"
							name="planning-category-color"
							value={option}
							bind:group={color}
							aria-label={planningColorStyles[option].label}
						/>
						<span class={`h-7 w-7 rounded-full ${planningColorStyles[option].swatch}`}></span>
					</label>
				{/each}
			</div>
		</fieldset>
		{#if errorMessage}<p class="text-sm text-error" role="alert">{errorMessage}</p>{/if}
		<div class="flex justify-end gap-2">
			<button class="btn btn-ghost" type="button" disabled={saving} onclick={() => dialog.close()}
				>Avbryt</button
			>
			<button class="btn btn-primary" type="submit" disabled={!online || saving || !name.trim()}
				>Lagre</button
			>
		</div>
	</form>
</ModalDialog>
