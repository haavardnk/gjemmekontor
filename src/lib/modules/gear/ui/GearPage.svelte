<script lang="ts">
	import {
		Archive,
		ArrowDown,
		ArrowUp,
		Backpack,
		Check,
		CircleAlert,
		GripVertical,
		ListMinus,
		ListPlus,
		Pencil,
		Plus,
		RotateCcw,
		Search,
		ShoppingCart,
		SlidersHorizontal,
		Trash2,
		X
	} from '@lucide/svelte';

	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		filterGearItems,
		type GearAvailability,
		type GearCategory,
		type GearItemSort,
		type GearItemView,
		type GearPersonView,
		gearProgress,
		repositionGearCategory,
		sortGearItems
	} from '$lib/modules/gear/domain/gear';

	let {
		people,
		categories,
		items
	}: { people: GearPersonView[]; categories: GearCategory[]; items: GearItemView[] } = $props();

	let mode = $state<'plan' | 'pack' | 'archive'>('plan');
	let query = $state('');
	let ownerFilter = $state('');
	let availabilityFilter = $state<'' | GearAvailability>('');
	let sort = $state<GearItemSort>('name');
	let archiveQuery = $state('');
	let archiveOwnerFilter = $state('');
	let archiveAvailabilityFilter = $state<'' | GearAvailability>('');
	let archiveCategoryFilter = $state('');
	let archivePlanFilter = $state<'' | 'planned' | 'not-planned'>('');
	let archiveSort = $state<GearItemSort>('name');
	let errorMessage = $state('');
	let saving = $state(false);
	let draggedCategoryId = $state<string>();
	let dragTargetCategoryId = $state<string>();

	let categoryDialog: HTMLDialogElement;
	let editingCategory = $state<GearCategory>();
	let categoryName = $state('');

	let itemDialog: HTMLDialogElement;
	let editingItem = $state<GearItemView>();
	let itemCategoryId = $state('');
	let itemName = $state('');
	let itemQuantity = $state(1);
	let itemOwnerIds = $state<string[]>([]);
	let itemAvailability = $state<GearAvailability>('available');
	let itemNotes = $state('');
	let itemPlanned = $state(true);

	let filtersDialog: HTMLDialogElement;

	const owners = $derived(people.filter((person) => person.activeTripMember));
	const ownerNames = $derived(new Map(people.map((owner) => [owner.id, owner.name])));
	const categoryNames = $derived(
		new Map(categories.map((category) => [category.id, category.name]))
	);
	const plannedItems = $derived(items.filter((item) => item.selected));
	const activeItems = $derived(
		mode === 'archive'
			? filterGearItems(items, {
					query: archiveQuery,
					...(archiveOwnerFilter ? { ownerId: archiveOwnerFilter } : {}),
					...(archiveAvailabilityFilter ? { availability: archiveAvailabilityFilter } : {}),
					...(archiveCategoryFilter ? { categoryId: archiveCategoryFilter } : {}),
					...(archivePlanFilter ? { planned: archivePlanFilter === 'planned' } : {}),
					categoryNames,
					ownerNames
				})
			: filterGearItems(plannedItems, {
					query,
					...(ownerFilter ? { ownerId: ownerFilter } : {}),
					...(availabilityFilter ? { availability: availabilityFilter } : {}),
					categoryNames,
					ownerNames
				})
	);
	const progress = $derived(gearProgress(plannedItems));
	const activeFilterCount = $derived(
		mode === 'archive'
			? Number(Boolean(archiveOwnerFilter)) +
					Number(Boolean(archiveAvailabilityFilter)) +
					Number(Boolean(archiveCategoryFilter)) +
					Number(Boolean(archivePlanFilter)) +
					Number(archiveSort !== 'name')
			: Number(Boolean(ownerFilter)) + Number(Boolean(availabilityFilter)) + Number(sort !== 'name')
	);
	const selectedOwnerName = $derived(
		mode === 'archive'
			? archiveOwnerFilter
				? (ownerNames.get(archiveOwnerFilter) ?? '')
				: ''
			: ownerFilter
				? (ownerNames.get(ownerFilter) ?? '')
				: ''
	);
	const hasFilters = $derived(
		mode === 'archive'
			? Boolean(
					archiveQuery.trim() ||
					archiveOwnerFilter ||
					archiveAvailabilityFilter ||
					archiveCategoryFilter ||
					archivePlanFilter
				)
			: Boolean(query.trim() || ownerFilter || availabilityFilter)
	);
	const visibleCategories = $derived(
		hasFilters
			? categories.filter((category) => activeItems.some((item) => item.categoryId === category.id))
			: categories
	);
	const sortedArchiveItems = $derived(
		sortGearItems(activeItems, archiveSort, ownerNames, categoryNames)
	);

	function itemsForCategory(categoryId: string): GearItemView[] {
		return sortGearItems(
			activeItems.filter((item) => item.categoryId === categoryId),
			sort,
			ownerNames,
			categoryNames
		);
	}

	async function apiMutation(url: string, method: string, body?: unknown): Promise<void> {
		const response = await fetch(url, {
			method,
			...(body === undefined
				? {}
				: { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
		});
		if (!response.ok) {
			const result = (await response.json().catch(() => ({}))) as { error?: string };
			throw new Error(result.error ?? 'GEAR_MUTATION_FAILED');
		}
		await invalidateAll();
	}

	function openCategory(category?: GearCategory): void {
		editingCategory = category;
		categoryName = category?.name ?? '';
		errorMessage = '';
		categoryDialog.showModal();
	}

	async function saveCategory(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const name = categoryName.trim();
		if (!name || saving) return;
		if (
			categories.some(
				(category) =>
					category.id !== editingCategory?.id &&
					category.name.toLocaleLowerCase('nb-NO') === name.toLocaleLowerCase('nb-NO')
			)
		) {
			errorMessage = 'Det finnes allerede en kategori med dette navnet.';
			return;
		}
		saving = true;
		try {
			const category = {
				id: editingCategory?.id ?? crypto.randomUUID(),
				name,
				position: editingCategory?.position ?? categories.length
			};
			await apiMutation('/api/gear/categories', 'POST', category);
			categoryDialog.close();
		} catch {
			errorMessage = 'Kunne ikke lagre kategorien.';
		} finally {
			saving = false;
		}
	}

	function openItem(categoryId: string, item?: GearItemView): void {
		editingItem = item;
		itemCategoryId = item?.categoryId ?? categoryId;
		itemName = item?.name ?? '';
		itemQuantity = item?.quantity ?? 1;
		itemOwnerIds = item?.ownerIds.filter((id) => owners.some((owner) => owner.id === id)) ?? [];
		itemAvailability = item?.availability ?? 'available';
		itemNotes = item?.notes ?? '';
		itemPlanned = item?.selected ?? mode !== 'archive';
		errorMessage = '';
		itemDialog.showModal();
	}

	async function saveItem(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!itemName.trim() || !itemCategoryId || saving) return;
		saving = true;
		try {
			await apiMutation(
				editingItem ? `/api/gear/items/${editingItem.id}` : '/api/gear/items',
				editingItem ? 'PUT' : 'POST',
				{
					id: editingItem?.id ?? crypto.randomUUID(),
					categoryId: itemCategoryId,
					name: itemName.trim(),
					quantity: itemQuantity,
					ownerIds: itemOwnerIds,
					availability: itemAvailability,
					notes: itemNotes.trim(),
					selected: itemPlanned
				}
			);
			itemDialog.close();
		} catch (error) {
			errorMessage =
				error instanceof Error && error.message === 'GEAR_OWNER_REQUIRED'
					? 'Velg minst én eier for tilgjengelig utstyr eller utstyr som bare skal ligge i arkivet.'
					: 'Kunne ikke lagre utstyret.';
		} finally {
			saving = false;
		}
	}

	async function deleteItem(item: GearItemView): Promise<void> {
		if (!window.confirm(`Arkivere ${item.name}? Ingen data slettes.`)) return;
		try {
			await apiMutation(`/api/gear/items/${item.id}`, 'DELETE');
		} catch {
			errorMessage = 'Utstyret er i bruk på en reise og må fjernes fra listen først.';
		}
	}

	async function setPlanned(item: GearItemView, planned: boolean): Promise<void> {
		await apiMutation(`/api/gear/items/${item.id}/selection`, 'PATCH', { selected: planned });
	}

	async function removeFromPlan(item: GearItemView): Promise<void> {
		if (!window.confirm(`Fjerne ${item.name} fra denne utstyrslisten? Den blir i arkivet.`)) return;
		await setPlanned(item, false);
	}

	async function deleteCategory(category: GearCategory): Promise<void> {
		const categoryItems = items.filter((item) => item.categoryId === category.id);
		if (categoryItems.length) {
			window.alert(
				`Flytt eller slett de ${categoryItems.length} arkiverte tingene før kategorien slettes.`
			);
			return;
		}
		if (!window.confirm(`Slette ${category.name}?`)) return;
		try {
			await apiMutation(`/api/gear/categories/${category.id}`, 'DELETE');
		} catch {
			errorMessage = 'Kategorien kan ikke arkiveres før alt utstyret er flyttet eller arkivert.';
		}
	}

	async function setPacked(item: GearItemView, packed: boolean): Promise<void> {
		if (item.availability !== 'available') return;
		try {
			await apiMutation(`/api/gear/items/${item.id}/packing`, 'PATCH', { packed });
		} catch {
			errorMessage = 'Avklar eieren før utstyret pakkes.';
		}
	}

	async function markAvailable(item: GearItemView): Promise<void> {
		const currentOwnerIds = item.ownerIds.filter((id) => owners.some((owner) => owner.id === id));
		if (!currentOwnerIds.length) {
			openItem(item.categoryId, item);
			itemAvailability = 'available';
			errorMessage = 'Velg minst én eier for å flytte innkjøpet til det globale arkivet.';
			return;
		}
		await apiMutation(`/api/gear/items/${item.id}`, 'PUT', {
			id: item.id,
			categoryId: item.categoryId,
			name: item.name,
			quantity: item.quantity,
			ownerIds: currentOwnerIds,
			availability: 'available',
			notes: item.notes,
			selected: true
		});
	}

	async function resetPacking(): Promise<void> {
		const packedItems = plannedItems.filter((item) => item.packed);
		if (!packedItems.length || !window.confirm('Nullstille alle avhukinger i pakkelisten?')) return;
		await Promise.all(
			packedItems.map((item) =>
				apiMutation(`/api/gear/items/${item.id}/packing`, 'PATCH', { packed: false })
			)
		);
	}

	async function persistCategoryOrder(reordered: ReturnType<typeof repositionGearCategory>) {
		await apiMutation('/api/gear/categories', 'PATCH', {
			categoryIds: reordered.map((category) => category.id)
		});
	}

	async function moveCategory(category: GearCategory, offset: -1 | 1): Promise<void> {
		const currentIndex = categories.findIndex((candidate) => candidate.id === category.id);
		const targetIndex = currentIndex + offset;
		if (targetIndex < 0 || targetIndex >= categories.length) return;
		await persistCategoryOrder(repositionGearCategory(categories, category.id, targetIndex));
	}

	async function dropCategory(targetCategoryId: string): Promise<void> {
		const sourceId = draggedCategoryId;
		draggedCategoryId = undefined;
		dragTargetCategoryId = undefined;
		if (!sourceId || sourceId === targetCategoryId) return;
		const targetIndex = categories.findIndex((category) => category.id === targetCategoryId);
		if (targetIndex < 0) return;
		await persistCategoryOrder(repositionGearCategory(categories, sourceId, targetIndex));
	}

	function toggleItemOwner(ownerId: string): void {
		itemOwnerIds = itemOwnerIds.includes(ownerId)
			? itemOwnerIds.filter((id) => id !== ownerId)
			: [...itemOwnerIds, ownerId];
	}

	async function retainItem(item: GearItemView): Promise<void> {
		try {
			await apiMutation(`/api/gear/items/${item.id}/retain`, 'POST');
		} catch {
			errorMessage = 'Kunne ikke beholde utstyret på denne reisen.';
		}
	}
</script>

<svelte:head><title>Utstyr · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-4xl px-4 py-5 pb-10 lg:py-7">
	<header class="mb-4">
		<div class="flex h-7 items-center gap-3">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
				<Backpack size={16} /> Turutstyr
			</p>
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
			onclick={() => filtersDialog.showModal()}
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
					onclick={() => {
						if (mode === 'archive') archiveOwnerFilter = '';
						else ownerFilter = '';
					}}
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

	{#if categories.length === 0}
		<div
			class="grid min-h-64 place-items-center rounded-box border border-dashed border-base-300 bg-base-100/45 p-8 text-center"
		>
			<div>
				<Backpack class="mx-auto mb-3 text-primary" size={38} />
				<h2 class="font-display text-2xl font-bold">Start med en kategori</h2>
				<p class="mt-1 text-sm text-base-content/60">
					For eksempel klær, sikkerhet eller elektronikk.
				</p>
				<button class="btn mt-5 btn-primary" type="button" onclick={() => openCategory()}>
					<Plus size={17} /> Legg til kategori
				</button>
			</div>
		</div>
	{:else if mode === 'archive'}
		{#if items.length === 0}
			<div
				class="grid min-h-64 place-items-center rounded-box border border-dashed border-base-300 bg-base-100/45 p-8 text-center"
			>
				<div>
					<Archive class="mx-auto mb-3 text-primary" size={38} />
					<h2 class="font-display text-2xl font-bold">Arkivet er tomt</h2>
					<p class="mt-1 text-sm text-base-content/60">
						Utstyr du oppretter her kan brukes på senere turer.
					</p>
					<button
						class="btn mt-5 btn-primary"
						type="button"
						onclick={() => openItem(categories[0]?.id ?? '')}
					>
						<Plus size={17} /> Legg til utstyr
					</button>
				</div>
			</div>
		{:else if sortedArchiveItems.length === 0}
			<div
				class="grid min-h-48 place-items-center border-y border-dashed border-base-300 text-center"
			>
				<p class="text-sm font-semibold text-base-content/55">
					Ingen arkivert utstyr matcher søket eller filtrene.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
				<div
					class="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200/55 px-4 py-3 text-sm"
				>
					<p class="font-semibold">{sortedArchiveItems.length} i arkivet</p>
					<p class="text-base-content/55">{plannedItems.length} på listen</p>
				</div>
				<ul class="divide-y divide-base-300" aria-label="Utstyrsarkiv">
					{#each sortedArchiveItems as item (item.id)}
						<li>
							<article
								class="flex min-h-20 items-center gap-3 px-3 py-3 sm:px-4"
								aria-label={item.name}
							>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
										<p class="font-semibold">{item.name}</p>
										{#if item.quantity > 1}<span class="badge badge-ghost badge-sm"
												>{item.quantity} stk.</span
											>{/if}
										<span class="badge badge-outline badge-sm"
											>{categoryNames.get(item.categoryId)}</span
										>
										{#if item.availability === 'need-to-buy'}<span
												class="badge badge-sm badge-warning">Må kjøpes</span
											>{/if}
										{#each item.ownerIds as ownerId (ownerId)}
											{#if ownerNames.get(ownerId)}<span class="badge badge-ghost badge-sm"
													>{ownerNames.get(ownerId)}</span
												>{/if}
										{/each}
										{#if item.retainedWithoutCurrentOwner}<span class="badge badge-sm badge-info"
												>Beholdt uten nåværende eier</span
											>{/if}
									</div>
									{#if item.notes}<p class="mt-0.5 text-sm text-base-content/55">
											{item.notes}
										</p>{/if}
								</div>
								<div class="flex shrink-0 items-center gap-1">
									{#if item.selected}
										<button
											class="btn btn-outline btn-xs"
											type="button"
											onclick={() => setPlanned(item, false)}
											aria-label={`Fjern ${item.name} fra listen`}
										>
											<ListMinus size={14} /> <span class="hidden sm:inline">På listen</span>
										</button>
									{:else}
										<button
											class="btn btn-primary btn-xs"
											type="button"
											onclick={() => setPlanned(item, true)}
											aria-label={`Legg ${item.name} til listen`}
										>
											<ListPlus size={14} /> <span class="hidden sm:inline">Legg til</span>
										</button>
									{/if}
									<button
										class="btn btn-square btn-ghost btn-sm"
										type="button"
										onclick={() => openItem(item.categoryId, item)}
										aria-label={`Endre ${item.name}`}><Pencil size={16} /></button
									>
									<button
										class="btn btn-square btn-ghost text-error btn-sm"
										type="button"
										onclick={() => deleteItem(item)}
										aria-label={`Arkiver ${item.name}`}><Trash2 size={16} /></button
									>
								</div>
							</article>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{:else if visibleCategories.length === 0}
		<div
			class="grid min-h-48 place-items-center border-y border-dashed border-base-300 text-center"
		>
			<p class="text-sm font-semibold text-base-content/55">Ingen utstyr matcher filtrene.</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each visibleCategories as category (category.id)}
				{@const categoryItems = itemsForCategory(category.id)}
				{@const fullCategoryIndex = categories.findIndex(
					(candidate) => candidate.id === category.id
				)}
				{@const categoryProgress = gearProgress(
					plannedItems.filter((item) => item.categoryId === category.id)
				)}
				<section
					class="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm"
					role="group"
					aria-label={category.name}
					class:ring-2={dragTargetCategoryId === category.id}
					class:ring-primary={dragTargetCategoryId === category.id}
					ondragover={(event) => {
						event.preventDefault();
						dragTargetCategoryId = category.id;
					}}
					ondragleave={() => {
						if (dragTargetCategoryId === category.id) dragTargetCategoryId = undefined;
					}}
					ondrop={(event) => {
						event.preventDefault();
						void dropCategory(category.id);
					}}
				>
					<header
						class="flex min-h-14 items-center gap-1 border-b border-base-300 bg-base-200/55 px-2 sm:px-3"
					>
						{#if mode === 'plan'}
							<button
								class="btn hidden btn-square cursor-grab btn-ghost btn-sm sm:inline-flex"
								type="button"
								draggable="true"
								ondragstart={(event) => {
									draggedCategoryId = category.id;
									event.dataTransfer?.setData('text/plain', category.id);
									if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
								}}
								ondragend={() => {
									draggedCategoryId = undefined;
									dragTargetCategoryId = undefined;
								}}
								aria-label={`Dra kategorien ${category.name}`}><GripVertical size={17} /></button
							>
						{/if}
						<div class="min-w-0 flex-1 px-1">
							<h2 class="truncate font-bold">{category.name}</h2>
							<p class="text-xs text-base-content/55">
								{#if mode === 'pack'}
									{categoryProgress.packed}/{categoryProgress.total} pakket
								{:else}
									{plannedItems.filter((item) => item.categoryId === category.id).length} ting
								{/if}
								{#if categoryProgress.needToBuy}
									· {categoryProgress.needToBuy} må kjøpes{/if}
							</p>
						</div>
						{#if mode === 'plan'}
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								disabled={fullCategoryIndex === 0}
								onclick={() => moveCategory(category, -1)}
								aria-label={`Flytt ${category.name} opp`}><ArrowUp size={16} /></button
							>
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								disabled={fullCategoryIndex === categories.length - 1}
								onclick={() => moveCategory(category, 1)}
								aria-label={`Flytt ${category.name} ned`}><ArrowDown size={16} /></button
							>
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								onclick={() => openCategory(category)}
								aria-label={`Endre kategorien ${category.name}`}><Pencil size={16} /></button
							>
							<button
								class="btn btn-square btn-ghost text-error btn-sm"
								type="button"
								onclick={() => deleteCategory(category)}
								aria-label={`Slett kategorien ${category.name}`}><Trash2 size={16} /></button
							>
						{/if}
					</header>

					{#if categoryItems.length}
						<ul class="divide-y divide-base-300" aria-label={`Utstyr i ${category.name}`}>
							{#each categoryItems as item (item.id)}
								<li class="flex min-h-16 items-start gap-3 px-3 py-2.5 sm:px-4">
									{#if mode === 'pack' && item.availability === 'available'}
										<input
											class="checkbox mt-1 shrink-0 checkbox-success"
											type="checkbox"
											checked={item.packed}
											disabled={item.needsOwnerResolution && !item.retainedWithoutCurrentOwner}
											onchange={(event) => setPacked(item, event.currentTarget.checked)}
											aria-label={`Pakket ${item.name}`}
										/>
									{:else if mode === 'pack'}
										<ShoppingCart class="shrink-0 text-warning" size={21} />
									{/if}
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
											<p
												class="font-semibold"
												class:line-through={item.packed}
												class:opacity-50={item.packed}
											>
												{item.name}
											</p>
											{#if item.quantity > 1}<span class="badge badge-ghost badge-sm"
													>{item.quantity} stk.</span
												>{/if}
											{#if item.availability === 'need-to-buy'}<span
													class="badge badge-sm badge-warning">Må kjøpes</span
												>{/if}
											{#each item.ownerIds as ownerId (ownerId)}
												{#if ownerNames.get(ownerId)}<span class="badge badge-outline badge-sm"
														>{ownerNames.get(ownerId)}</span
													>{/if}
											{/each}
											{#if item.retainedWithoutCurrentOwner}<span class="badge badge-sm badge-info"
													>Beholdt uten nåværende eier</span
												>{/if}
										</div>
										{#if item.notes}<p class="mt-0.5 text-sm text-base-content/55">
												{item.notes}
											</p>{/if}
										{#if item.needsOwnerResolution && !item.retainedWithoutCurrentOwner}
											<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-warning">
												<span>Ingen av eierne er med på denne reisen.</span>
												<button
													class="btn btn-outline btn-xs"
													type="button"
													onclick={() => retainItem(item)}>Behold likevel</button
												>
												<button
													class="btn btn-ghost btn-xs"
													type="button"
													onclick={() => openItem(category.id, item)}>Bytt eier</button
												>
												<button
													class="btn btn-ghost btn-xs"
													type="button"
													onclick={() => removeFromPlan(item)}>Fjern</button
												>
											</div>
										{/if}
									</div>
									{#if mode === 'plan'}
										<button
											class="btn btn-square btn-ghost btn-sm"
											type="button"
											onclick={() => openItem(category.id, item)}
											aria-label={`Endre ${item.name}`}><Pencil size={16} /></button
										>
										<button
											class="btn btn-square btn-ghost btn-sm"
											type="button"
											onclick={() => removeFromPlan(item)}
											aria-label={`Flytt ${item.name} til arkivet`}><Archive size={16} /></button
										>
									{:else if item.availability === 'need-to-buy'}
										<button
											class="btn btn-outline btn-xs"
											type="button"
											onclick={() => markAvailable(item)}
										>
											<Check size={14} /> Kjøpt inn
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{:else if !hasFilters}
						<p class="px-4 py-5 text-center text-sm text-base-content/50">
							Ingen utstyr i kategorien ennå.
						</p>
					{/if}
					{#if mode === 'plan'}
						<button
							class="btn m-2 min-h-11 w-[calc(100%-1rem)] border-dashed border-base-300 btn-ghost btn-sm"
							type="button"
							onclick={() => openItem(category.id)}><Plus size={16} /> Legg til utstyr</button
						>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</section>

<dialog
	bind:this={filtersDialog}
	class="modal modal-bottom sm:modal-middle"
	aria-labelledby="gear-filters-dialog-title"
>
	<div class="modal-box max-w-md rounded-t-2xl sm:rounded-box">
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
					}
				}}
				disabled={activeFilterCount === 0}>Nullstill</button
			>
			<button class="btn btn-primary" type="button" onclick={() => filtersDialog.close()}>
				Ferdig
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk filter og sortering">Lukk</button>
	</form>
</dialog>

<dialog
	bind:this={categoryDialog}
	class="modal"
	aria-labelledby="gear-category-dialog-title"
	onclose={() => {
		editingCategory = undefined;
		errorMessage = '';
	}}
>
	<div class="modal-box max-w-md rounded-box">
		<h2 id="gear-category-dialog-title" class="font-display text-2xl font-bold">
			{editingCategory ? 'Endre kategori' : 'Ny kategori'}
		</h2>
		<form class="mt-5" onsubmit={saveCategory}>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Navn</span>
				<input
					class="input w-full"
					bind:value={categoryName}
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
				<button class="btn btn-primary" type="submit" disabled={saving || !categoryName.trim()}
					>Lagre</button
				>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk kategoridialogen">Lukk</button>
	</form>
</dialog>

<dialog
	bind:this={itemDialog}
	class="modal"
	aria-labelledby="gear-item-dialog-title"
	onclose={() => {
		editingItem = undefined;
		errorMessage = '';
	}}
>
	<div class="modal-box max-w-lg rounded-box">
		<h2 id="gear-item-dialog-title" class="font-display text-2xl font-bold">
			{editingItem ? 'Endre utstyr' : 'Nytt utstyr'}
		</h2>
		<form class="mt-5 space-y-4" onsubmit={saveItem}>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Navn</span>
				<input
					class="input w-full"
					bind:value={itemName}
					maxlength="150"
					required
					aria-label="Utstyrsnavn"
				/>
			</label>
			<div class="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
				<label class="form-control block">
					<span class="mb-2 block text-sm font-semibold">Kategori</span>
					<select class="select w-full" bind:value={itemCategoryId} aria-label="Kategori" required>
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
						bind:value={itemQuantity}
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
									checked={itemOwnerIds.includes(owner.id)}
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
					<select class="select w-full" bind:value={itemAvailability} aria-label="Tilgjengelighet">
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
					bind:value={itemNotes}
					maxlength="500"
					aria-label="Notater"></textarea>
			</label>
			<label
				class="flex cursor-pointer items-center gap-3 rounded-box border border-base-300 bg-base-200/45 p-3"
			>
				<input class="checkbox checkbox-primary" type="checkbox" bind:checked={itemPlanned} />
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
				<button class="btn btn-primary" type="submit" disabled={saving || !itemName.trim()}
					>Lagre</button
				>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk utstyrsdialogen">Lukk</button>
	</form>
</dialog>
