<script lang="ts">
	import {
		Archive,
		ArrowDown,
		ArrowUp,
		Backpack,
		Check,
		GripVertical,
		ListMinus,
		ListPlus,
		Pencil,
		Plus,
		ShoppingCart,
		Trash2
	} from '@lucide/svelte';

	import { type GearCategory, type GearItemView, gearProgress } from '../domain/gear';
	import type { GearItemGroup } from './gear-view';

	let {
		categories,
		items,
		plannedItems,
		sortedArchiveItems,
		itemGroups,
		mode,
		hasFilters,
		categoryNames,
		ownerNames,
		openCategory,
		openItem,
		deleteItem,
		setPlanned,
		deleteCategory,
		moveCategory,
		dropCategory,
		setPacked,
		retainItem,
		removeFromPlan,
		markAvailable
	}: {
		categories: GearCategory[];
		items: GearItemView[];
		plannedItems: GearItemView[];
		sortedArchiveItems: GearItemView[];
		itemGroups: GearItemGroup[];
		mode: 'plan' | 'pack' | 'archive';
		hasFilters: boolean;
		categoryNames: Map<string, string>;
		ownerNames: Map<string, string>;
		openCategory: (category?: GearCategory) => void;
		openItem: (categoryId: string, item?: GearItemView, ownerId?: string) => void;
		deleteItem: (item: GearItemView) => void;
		setPlanned: (item: GearItemView, planned: boolean) => void;
		deleteCategory: (category: GearCategory) => void;
		moveCategory: (category: GearCategory, offset: -1 | 1) => void;
		dropCategory: (sourceId: string, targetCategoryId: string) => void;
		setPacked: (item: GearItemView, packed: boolean) => void;
		retainItem: (item: GearItemView) => void;
		removeFromPlan: (item: GearItemView) => void;
		markAvailable: (item: GearItemView) => void;
	} = $props();

	let draggedCategoryId = $state<string>();
	let dragTargetCategoryId = $state<string>();

	function finishCategoryDrop(targetCategoryId: string): void {
		const sourceId = draggedCategoryId;
		draggedCategoryId = undefined;
		dragTargetCategoryId = undefined;
		if (sourceId) dropCategory(sourceId, targetCategoryId);
	}
</script>

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
{:else if itemGroups.length === 0}
	<div class="grid min-h-48 place-items-center border-y border-dashed border-base-300 text-center">
		<p class="text-sm font-semibold text-base-content/55">Ingen utstyr matcher filtrene.</p>
	</div>
{:else}
	<div class="space-y-4">
		{#each itemGroups as group (group.id)}
			{@const category = group.kind === 'category' ? group.category : undefined}
			{@const fullCategoryIndex = category
				? categories.findIndex((candidate) => candidate.id === category.id)
				: -1}
			{@const groupProgress = gearProgress(group.allItems)}
			<section
				class="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm"
				role="group"
				aria-label={group.name}
				class:ring-2={category && dragTargetCategoryId === category.id}
				class:ring-primary={category && dragTargetCategoryId === category.id}
				ondragover={(event) => {
					if (!category) return;
					event.preventDefault();
					dragTargetCategoryId = category.id;
				}}
				ondragleave={() => {
					if (category && dragTargetCategoryId === category.id) dragTargetCategoryId = undefined;
				}}
				ondrop={(event) => {
					if (!category) return;
					event.preventDefault();
					finishCategoryDrop(category.id);
				}}
			>
				<header
					class="flex min-h-14 items-center gap-1 border-b border-base-300 bg-base-200/55 px-2 sm:px-3"
				>
					{#if mode === 'plan' && category}
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
						<h2 class="truncate font-bold">{group.name}</h2>
						<p class="text-xs text-base-content/55">
							{#if mode === 'pack'}
								{groupProgress.packed}/{groupProgress.total} pakket
							{:else}
								{group.allItems.length} ting
							{/if}
							{#if groupProgress.needToBuy}
								· {groupProgress.needToBuy} må kjøpes{/if}
						</p>
					</div>
					{#if mode === 'plan' && category}
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

				{#if group.items.length}
					<ul class="divide-y divide-base-300" aria-label={`Utstyr for ${group.name}`}>
						{#each group.items as item (item.id)}
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
										{#if group.kind === 'person'}<span class="badge badge-ghost badge-sm"
												>{categoryNames.get(item.categoryId)}</span
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
												onclick={() => openItem(item.categoryId, item)}>Bytt eier</button
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
										onclick={() => openItem(item.categoryId, item)}
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
						Ingen utstyr i gruppen ennå.
					</p>
				{/if}
				{#if mode === 'plan' && category}
					<button
						class="btn m-2 min-h-11 w-[calc(100%-1rem)] border-dashed border-base-300 btn-ghost btn-sm"
						type="button"
						onclick={() => openItem(category.id)}><Plus size={16} /> Legg til utstyr</button
					>
				{:else if mode === 'plan' && group.kind === 'person' && group.ownerId}
					<button
						class="btn m-2 min-h-11 w-[calc(100%-1rem)] border-dashed border-base-300 btn-ghost btn-sm"
						type="button"
						onclick={() => openItem(categories[0]?.id ?? '', undefined, group.ownerId)}
						><Plus size={16} /> Legg til utstyr</button
					>
				{/if}
			</section>
		{/each}
	</div>
{/if}
