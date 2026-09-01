<script lang="ts">
	import {
		Backpack,
		Check,
		CircleAlert,
		Plus,
		RotateCcw,
		Search,
		SlidersHorizontal,
		X
	} from '@lucide/svelte';

	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import {
		type GearAvailability,
		type GearCategory,
		type GearItemSort,
		type GearItemView,
		gearProgress
	} from '../domain/gear';

	let {
		mode = $bindable(),
		categories,
		progress,
		query = $bindable(),
		archiveQuery = $bindable(),
		activeFilterCount,
		selectedOwnerName,
		categoryNames,
		errorMessage,
		availabilityFilter = $bindable(),
		sort = $bindable(),
		grouping = $bindable(),
		archiveAvailabilityFilter = $bindable(),
		archiveCategoryFilter = $bindable(),
		archivePlanFilter = $bindable(),
		archiveSort = $bindable(),
		openCategory,
		openItem,
		resetPacking,
		onopenFilters,
		onclearOwner
	}: {
		mode: 'plan' | 'pack' | 'archive';
		categories: GearCategory[];
		progress: ReturnType<typeof gearProgress>;
		query: string;
		archiveQuery: string;
		activeFilterCount: number;
		selectedOwnerName: string;
		categoryNames: Map<string, string>;
		errorMessage: string;
		availabilityFilter: '' | GearAvailability;
		sort: GearItemSort;
		grouping: 'category' | 'person';
		archiveAvailabilityFilter: '' | GearAvailability;
		archiveCategoryFilter: string;
		archivePlanFilter: '' | 'planned' | 'not-planned';
		archiveSort: GearItemSort;
		openCategory: (category?: GearCategory) => void;
		openItem: (categoryId: string, item?: GearItemView, ownerId?: string) => void;
		resetPacking: () => void;
		onopenFilters: () => void;
		onclearOwner: () => void;
	} = $props();
</script>

<header class="mb-4">
	<div class="flex h-7 items-center justify-between gap-3">
		<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
			<Backpack size={16} /> Turutstyr
		</p>
		<SyncStatus moduleId="gear" />
	</div>
	<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Utstyr</h1>
</header>

<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
	<div class="join" role="group" aria-label="Visning">
		<button
			class="btn join-item btn-sm"
			class:btn-primary={mode === 'plan'}
			class:btn-ghost={mode !== 'plan'}
			type="button"
			onclick={() => (mode = 'plan')}>Planlegg</button
		>
		<button
			class="btn join-item btn-sm"
			class:btn-primary={mode === 'pack'}
			class:btn-ghost={mode !== 'pack'}
			type="button"
			onclick={() => (mode = 'pack')}>Pakk</button
		>
		<button
			class="btn join-item btn-sm"
			class:btn-primary={mode === 'archive'}
			class:btn-ghost={mode !== 'archive'}
			type="button"
			onclick={() => (mode = 'archive')}>Arkiv</button
		>
	</div>
	<div class="flex flex-wrap justify-end gap-2">
		{#if mode === 'plan'}
			<button class="btn btn-primary btn-sm" type="button" onclick={() => openCategory()}>
				<Plus size={16} /> Kategori
			</button>
		{:else if mode === 'pack'}
			<span
				class="badge h-8 gap-1.5 border-primary/25 bg-primary/10 px-3 font-semibold text-primary"
			>
				<Check size={14} />
				{progress.packed}/{progress.total} pakket
				{#if progress.needToBuy}
					· {progress.needToBuy} kjøp{/if}
			</span>
			<button
				class="btn btn-square btn-ghost btn-sm"
				type="button"
				onclick={resetPacking}
				disabled={progress.packed === 0}
				aria-label="Nullstill pakkelisten"
				title="Nullstill pakkelisten"><RotateCcw size={16} /></button
			>
		{:else}
			<button
				class="btn btn-primary btn-sm"
				type="button"
				onclick={() => openItem(categories[0]?.id ?? '')}
				disabled={categories.length === 0}
			>
				<Plus size={16} /> Utstyr
			</button>
		{/if}
	</div>
</div>

<div class="mb-4 flex gap-2">
	{#if mode === 'archive'}
		<label class="input flex min-w-0 flex-1 items-center gap-2 bg-base-100">
			<Search size={17} />
			<input
				class="min-w-0 grow"
				type="search"
				placeholder="Søk i arkivet"
				aria-label="Søk i arkivet"
				bind:value={archiveQuery}
			/>
			{#if archiveQuery}<button
					class="btn btn-square btn-ghost btn-xs"
					type="button"
					onclick={() => (archiveQuery = '')}
					aria-label="Tøm arkivsøket"><X size={15} /></button
				>{/if}
		</label>
	{:else}
		<label class="input flex min-w-0 flex-1 items-center gap-2 bg-base-100">
			<Search size={17} />
			<input
				class="min-w-0 grow"
				type="search"
				placeholder="Søk i utstyr"
				aria-label="Søk i utstyr"
				bind:value={query}
			/>
			{#if query}<button
					class="btn btn-square btn-ghost btn-xs"
					type="button"
					onclick={() => (query = '')}
					aria-label="Tøm søket"><X size={15} /></button
				>{/if}
		</label>
	{/if}
	<button
		class="btn relative shrink-0 btn-outline"
		type="button"
		onclick={onopenFilters}
		aria-label="Filter og sortering"
	>
		<SlidersHorizontal size={17} /><span class="hidden sm:inline">Filter</span>
		{#if activeFilterCount}<span class="badge badge-sm badge-primary">{activeFilterCount}</span
			>{/if}
	</button>
</div>
{#if activeFilterCount}
	<div class="mb-4 flex flex-wrap gap-1.5" aria-label="Aktive filtre">
		{#if selectedOwnerName}<button
				class="badge h-7 gap-1 badge-outline"
				type="button"
				onclick={onclearOwner}
				aria-label={`Fjern personfilter ${selectedOwnerName}`}
				>{selectedOwnerName} <X size={13} /></button
			>{/if}
		{#if mode === 'archive'}
			{#if archiveCategoryFilter}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (archiveCategoryFilter = '')}
					aria-label="Fjern kategorifilter"
					>{categoryNames.get(archiveCategoryFilter)} <X size={13} /></button
				>{/if}
			{#if archiveAvailabilityFilter}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (archiveAvailabilityFilter = '')}
					aria-label="Fjern tilgjengelighetsfilter"
					>{archiveAvailabilityFilter === 'available' ? 'Tilgjengelig' : 'Må kjøpes'}
					<X size={13} /></button
				>{/if}
			{#if archivePlanFilter}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (archivePlanFilter = '')}
					aria-label="Fjern listefilter"
					>{archivePlanFilter === 'planned' ? 'På listen' : 'Ikke på listen'}
					<X size={13} /></button
				>{/if}
			{#if archiveSort !== 'name'}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (archiveSort = 'name')}
					aria-label="Tilbakestill arkivsortering"
					>Sortert: {archiveSort === 'category'
						? 'kategori'
						: archiveSort === 'owner'
							? 'person'
							: 'må kjøpes'}
					<X size={13} /></button
				>{/if}
		{:else}
			{#if grouping !== 'category'}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (grouping = 'category')}
					aria-label="Grupper etter kategori">Gruppert: person <X size={13} /></button
				>{/if}
			{#if availabilityFilter}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (availabilityFilter = '')}
					aria-label="Fjern tilgjengelighetsfilter"
					>{availabilityFilter === 'available' ? 'Tilgjengelig' : 'Må kjøpes'}
					<X size={13} /></button
				>{/if}
			{#if sort !== 'name'}<button
					class="badge h-7 gap-1 badge-outline"
					type="button"
					onclick={() => (sort = 'name')}
					aria-label="Tilbakestill sortering"
					>Sortert: {sort === 'owner'
						? 'person'
						: sort === 'availability'
							? 'må kjøpes'
							: 'upakket'}
					<X size={13} /></button
				>{/if}
		{/if}
	</div>
{/if}

{#if errorMessage}
	<div class="mb-4 alert alert-error" role="alert">
		<CircleAlert size={18} /><span>{errorMessage}</span>
	</div>
{/if}
