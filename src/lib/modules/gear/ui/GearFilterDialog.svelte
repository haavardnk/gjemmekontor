<script lang="ts">
	import ModalDialog from '$lib/ui/ModalDialog.svelte';

	import type {
		GearAvailability,
		GearCategory,
		GearItemSort,
		GearPersonView
	} from '../domain/gear';

	let {
		dialog = $bindable(),
		mode,
		categories,
		owners,
		activeFilterCount,
		archiveCategoryFilter = $bindable(),
		archiveOwnerFilter = $bindable(),
		archiveAvailabilityFilter = $bindable(),
		archivePlanFilter = $bindable(),
		archiveSort = $bindable(),
		grouping = $bindable(),
		ownerFilter = $bindable(),
		availabilityFilter = $bindable(),
		sort = $bindable()
	}: {
		dialog: HTMLDialogElement;
		mode: 'plan' | 'pack' | 'archive';
		categories: GearCategory[];
		owners: GearPersonView[];
		activeFilterCount: number;
		archiveCategoryFilter: string;
		archiveOwnerFilter: string;
		archiveAvailabilityFilter: '' | GearAvailability;
		archivePlanFilter: '' | 'planned' | 'not-planned';
		archiveSort: GearItemSort;
		grouping: 'category' | 'person';
		ownerFilter: string;
		availabilityFilter: '' | GearAvailability;
		sort: GearItemSort;
	} = $props();

	const filtersDialog = $derived(dialog);
</script>

<ModalDialog
	bind:dialog
	modalClass="modal modal-bottom sm:modal-middle"
	boxClass="modal-box max-w-md rounded-t-2xl sm:rounded-box"
	labelledBy="gear-filters-dialog-title"
	closeLabel="Lukk filter og sortering"
>
	<h2 id="gear-filters-dialog-title" class="font-display text-2xl font-bold">
		Filter og sortering
	</h2>
	<div class="mt-5 space-y-5">
		{#if mode === 'archive'}
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Kategori</span>
				<select
					class="select w-full"
					bind:value={archiveCategoryFilter}
					aria-label="Filtrer arkivet på kategori"
				>
					<option value="">Alle kategorier</option>
					{#each categories as category (category.id)}<option value={category.id}
							>{category.name}</option
						>{/each}
				</select>
			</label>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Person</span>
				<select
					class="select w-full"
					bind:value={archiveOwnerFilter}
					aria-label="Filtrer arkivet på person"
				>
					<option value="">Alle personer</option>
					{#each owners as owner (owner.id)}<option value={owner.id}>{owner.name}</option>{/each}
				</select>
			</label>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Tilgjengelighet</span>
				<select
					class="select w-full"
					bind:value={archiveAvailabilityFilter}
					aria-label="Filtrer arkivet på tilgjengelighet"
				>
					<option value="">All tilgjengelighet</option>
					<option value="available">Tilgjengelig</option>
					<option value="need-to-buy">Må kjøpes</option>
				</select>
			</label>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Gjeldende liste</span>
				<select
					class="select w-full"
					bind:value={archivePlanFilter}
					aria-label="Filtrer arkivet på listestatus"
				>
					<option value="">Alle</option>
					<option value="planned">På listen</option>
					<option value="not-planned">Ikke på listen</option>
				</select>
			</label>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Sorter etter</span>
				<select class="select w-full" bind:value={archiveSort} aria-label="Sorter arkivet">
					<option value="name">Navn</option>
					<option value="category">Kategori</option>
					<option value="owner">Person</option>
					<option value="availability">Må kjøpes først</option>
				</select>
			</label>
		{:else}
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Grupper etter</span>
				<select class="select w-full" bind:value={grouping} aria-label="Grupper utstyr">
					<option value="category">Kategori</option>
					<option value="person">Person</option>
				</select>
			</label>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Person</span>
				<select class="select w-full" bind:value={ownerFilter} aria-label="Filtrer på person">
					<option value="">Alle personer</option>
					{#each owners as owner (owner.id)}<option value={owner.id}>{owner.name}</option>{/each}
				</select>
			</label>
			<div>
				<p class="mb-2 text-sm font-semibold">Tilgjengelighet</p>
				<div class="join grid grid-cols-3" role="group" aria-label="Filtrer på tilgjengelighet">
					{#each [{ value: '', label: 'Alle' }, { value: 'available', label: 'Har' }, { value: 'need-to-buy', label: 'Må kjøpes' }] as option (option.value)}
						<button
							class="btn join-item btn-sm"
							class:btn-primary={availabilityFilter === option.value}
							class:btn-ghost={availabilityFilter !== option.value}
							type="button"
							onclick={() => (availabilityFilter = option.value as '' | GearAvailability)}
							aria-pressed={availabilityFilter === option.value}>{option.label}</button
						>
					{/each}
				</div>
			</div>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Sorter etter</span>
				<select class="select w-full" bind:value={sort} aria-label="Sorter utstyr">
					<option value="name">Navn</option>
					<option value="owner">Person</option>
					<option value="availability">Må kjøpes først</option>
					<option value="unpacked">Upakket først</option>
				</select>
			</label>
		{/if}
	</div>
	<div class="mt-6 grid grid-cols-2 gap-2">
		<button
			class="btn btn-ghost"
			type="button"
			onclick={() => {
				if (mode === 'archive') {
					archiveOwnerFilter = '';
					archiveAvailabilityFilter = '';
					archiveCategoryFilter = '';
					archivePlanFilter = '';
					archiveSort = 'name';
				} else {
					ownerFilter = '';
					availabilityFilter = '';
					sort = 'name';
					grouping = 'category';
				}
			}}
			disabled={activeFilterCount === 0}>Nullstill</button
		>
		<button class="btn btn-primary" type="button" onclick={() => filtersDialog.close()}>
			Ferdig
		</button>
	</div>
</ModalDialog>
