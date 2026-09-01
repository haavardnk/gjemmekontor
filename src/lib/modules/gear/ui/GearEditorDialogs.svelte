<script lang="ts">
	import ModalDialog from '$lib/ui/ModalDialog.svelte';

	import type { GearCategory, GearPersonView } from '../domain/gear';
	import {
		emptyGearCategoryDraft,
		emptyGearItemDraft,
		type GearCategoryDraft,
		type GearItemDraft
	} from './gear-editor';

	let {
		categoryDialog = $bindable(),
		itemDialog = $bindable(),
		categoryDraft,
		itemDraft,
		categories,
		owners,
		saving,
		errorMessage = $bindable(),
		saveCategory,
		saveItem,
		toggleItemOwner
	}: {
		categoryDialog: HTMLDialogElement;
		itemDialog: HTMLDialogElement;
		categoryDraft: GearCategoryDraft;
		itemDraft: GearItemDraft;
		categories: GearCategory[];
		owners: GearPersonView[];
		saving: boolean;
		errorMessage: string;
		saveCategory: (event: SubmitEvent) => void;
		saveItem: (event: SubmitEvent) => void;
		toggleItemOwner: (ownerId: string) => void;
	} = $props();
</script>

<ModalDialog
	bind:dialog={categoryDialog}
	boxClass="modal-box max-w-md rounded-box"
	labelledBy="gear-category-dialog-title"
	closeLabel="Lukk kategoridialogen"
	onclose={() => {
		categoryDraft = emptyGearCategoryDraft();
		errorMessage = '';
	}}
>
	<h2 id="gear-category-dialog-title" class="font-display text-2xl font-bold">
		{categoryDraft.editing ? 'Endre kategori' : 'Ny kategori'}
	</h2>
	<form class="mt-5" onsubmit={saveCategory}>
		<label class="form-control block">
			<span class="mb-2 block text-sm font-semibold">Navn</span>
			<input
				class="input w-full"
				bind:value={categoryDraft.name}
				maxlength="100"
				required
				aria-label="Kategorinavn"
			/>
		</label>
		{#if errorMessage}<p class="mt-2 text-sm text-error" role="alert">{errorMessage}</p>{/if}
		<div class="mt-6 grid grid-cols-2 gap-2">
			<button
				class="btn btn-ghost"
				type="button"
				onclick={() => categoryDialog.close()}
				disabled={saving}>Avbryt</button
			>
			<button class="btn btn-primary" type="submit" disabled={saving || !categoryDraft.name.trim()}
				>Lagre</button
			>
		</div>
	</form>
</ModalDialog>

<ModalDialog
	bind:dialog={itemDialog}
	boxClass="modal-box max-w-lg rounded-box"
	labelledBy="gear-item-dialog-title"
	closeLabel="Lukk utstyrsdialogen"
	onclose={() => {
		itemDraft = emptyGearItemDraft();
		errorMessage = '';
	}}
>
	<h2 id="gear-item-dialog-title" class="font-display text-2xl font-bold">
		{itemDraft.editing ? 'Endre utstyr' : 'Nytt utstyr'}
	</h2>
	<form class="mt-5 space-y-4" onsubmit={saveItem}>
		<label class="form-control block">
			<span class="mb-2 block text-sm font-semibold">Navn</span>
			<input
				class="input w-full"
				bind:value={itemDraft.name}
				maxlength="150"
				required
				aria-label="Utstyrsnavn"
			/>
		</label>
		<div class="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Kategori</span>
				<select
					class="select w-full"
					bind:value={itemDraft.categoryId}
					aria-label="Kategori"
					required
				>
					{#each categories as category (category.id)}<option value={category.id}
							>{category.name}</option
						>{/each}
				</select>
			</label>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Antall</span>
				<input
					class="input w-full"
					type="number"
					min="1"
					max="999"
					bind:value={itemDraft.quantity}
					aria-label="Antall"
					required
				/>
			</label>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<fieldset class="form-control block">
				<legend class="mb-2 block text-sm font-semibold">
					Eiere <span class="font-normal text-base-content/50">(flere kan velges)</span>
				</legend>
				<div class="max-h-36 space-y-1 overflow-y-auto rounded-box border border-base-300 p-2">
					{#each owners as owner (owner.id)}
						<label
							class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-base-200"
						>
							<input
								class="checkbox checkbox-sm checkbox-primary"
								type="checkbox"
								checked={itemDraft.ownerIds.includes(owner.id)}
								onchange={() => toggleItemOwner(owner.id)}
							/>
							<span class="text-sm">{owner.name}</span>
						</label>
					{:else}
						<p class="px-2 py-1 text-sm text-base-content/55">
							Legg til personer i reiseinnstillingene.
						</p>
					{/each}
				</div>
			</fieldset>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Tilgjengelighet</span>
				<select
					class="select w-full"
					bind:value={itemDraft.availability}
					aria-label="Tilgjengelighet"
				>
					<option value="available">Tilgjengelig</option>
					<option value="need-to-buy">Må kjøpes</option>
				</select>
			</label>
		</div>
		<label class="form-control block">
			<span class="mb-2 block text-sm font-semibold"
				>Notater <span class="font-normal text-base-content/50">(valgfritt)</span></span
			>
			<textarea
				class="textarea min-h-24 w-full"
				bind:value={itemDraft.notes}
				maxlength="500"
				aria-label="Notater"></textarea>
		</label>
		<label
			class="flex cursor-pointer items-center gap-3 rounded-box border border-base-300 bg-base-200/45 p-3"
		>
			<input class="checkbox checkbox-primary" type="checkbox" bind:checked={itemDraft.planned} />
			<span>
				<span class="block text-sm font-semibold">Legg til i gjeldende liste</span>
				<span class="block text-xs text-base-content/55"
					>Utstyret blir i arkivet selv om det fjernes fra listen.</span
				>
			</span>
		</label>
		<div class="grid grid-cols-2 gap-2 pt-2">
			<button
				class="btn btn-ghost"
				type="button"
				onclick={() => itemDialog.close()}
				disabled={saving}>Avbryt</button
			>
			<button class="btn btn-primary" type="submit" disabled={saving || !itemDraft.name.trim()}
				>Lagre</button
			>
		</div>
	</form>
</ModalDialog>
