<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		Edit3,
		EllipsisVertical,
		GripVertical,
		Plus,
		Trash2
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	import type { PlanningCategory, PlanningSection } from '../domain/planning';
	import { planningColorStyles, unsortedAccent } from './planning-colors';
	import PlanningCardTile from './PlanningCardTile.svelte';

	let {
		sections,
		categories,
		canWrite,
		onopen,
		onnewcard,
		oneditcategory,
		ondeletecategory,
		onplacecard,
		onplacecategory
	}: {
		sections: PlanningSection[];
		categories: PlanningCategory[];
		canWrite: boolean;
		onopen: (cardId: string) => void;
		onnewcard: (categoryId: string | null) => void;
		oneditcategory: (category: PlanningCategory) => void;
		ondeletecategory: (category: PlanningCategory) => Promise<void>;
		onplacecard: (cardId: string, categoryId: string | null, index: number) => Promise<void>;
		onplacecategory: (categoryId: string, index: number) => Promise<void>;
	} = $props();

	let board = $state<HTMLElement>();
	let draggedCardId = $state<string>();
	let draggedCategoryId = $state<string>();
	let dropTarget = $state<string>();

	function closeMenus(except?: Node): void {
		for (const menu of board?.querySelectorAll('details[open]') ?? []) {
			if (!except || !menu.contains(except)) menu.removeAttribute('open');
		}
	}

	function endDrag(): void {
		draggedCardId = undefined;
		draggedCategoryId = undefined;
		dropTarget = undefined;
	}

	function startDrag(event: DragEvent, id: string): void {
		event.dataTransfer?.setData('text/plain', id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function dropOnSection(categoryId: string | null, cardCount: number): void {
		const cardId = draggedCardId;
		const movedCategoryId = draggedCategoryId;
		endDrag();
		if (cardId) void onplacecard(cardId, categoryId, cardCount);
		if (movedCategoryId && categoryId && movedCategoryId !== categoryId) {
			void onplacecategory(
				movedCategoryId,
				categories.findIndex(({ id }) => id === categoryId)
			);
		}
	}

	function dropOnCard(categoryId: string | null, index: number): void {
		const cardId = draggedCardId;
		endDrag();
		if (cardId) void onplacecard(cardId, categoryId, index);
	}

	onMount(() => {
		function closeOutside(event: PointerEvent): void {
			closeMenus(event.target as Node);
		}
		document.addEventListener('pointerdown', closeOutside);
		return (): void => document.removeEventListener('pointerdown', closeOutside);
	});
</script>

<div class="space-y-5" bind:this={board}>
	{#each sections as section (section.category?.id ?? 'unsorted')}
		{@const category = section.category}
		{@const categoryIndex = category ? categories.findIndex(({ id }) => id === category.id) : -1}
		{@const name = category?.name ?? 'Usortert'}
		{@const sectionKey = category?.id ?? 'unsorted'}
		{@const accent = category ? planningColorStyles[category.color].accent : unsortedAccent}
		<section
			class="rounded-box"
			class:ring-2={dropTarget === sectionKey}
			class:ring-primary={dropTarget === sectionKey}
			aria-label={name}
			ondragover={(event) => {
				if (!draggedCardId && !(draggedCategoryId && category)) return;
				event.preventDefault();
				dropTarget = sectionKey;
			}}
			ondragleave={() => {
				if (dropTarget === sectionKey) dropTarget = undefined;
			}}
			ondrop={(event) => {
				event.preventDefault();
				dropOnSection(category?.id ?? null, section.cards.length);
			}}
		>
			<header class="mb-2 flex min-h-11 items-center gap-1">
				{#if canWrite && category}
					<button
						class="btn hidden btn-square cursor-grab btn-ghost btn-sm sm:inline-flex"
						type="button"
						draggable="true"
						ondragstart={(event) => {
							draggedCategoryId = category.id;
							startDrag(event, category.id);
						}}
						ondragend={endDrag}
						aria-label={`Dra kategorien ${category.name}`}><GripVertical size={17} /></button
					>
				{/if}
				<span
					class={`h-3 w-3 shrink-0 rounded-full ${category ? planningColorStyles[category.color].swatch : 'bg-base-300'}`}
				></span>
				<h2 class="min-w-0 truncate px-1 text-lg font-bold">{name}</h2>
				<span class="text-sm text-base-content/55">{section.cards.length}</span>
				<div class="ml-auto flex items-center gap-1">
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						disabled={!canWrite}
						onclick={() => onnewcard(category?.id ?? null)}
						aria-label={`Nytt kort i ${name}`}><Plus size={18} /></button
					>
					{#if category}
						<details class="dropdown dropdown-end">
							<summary
								class="btn btn-square list-none btn-ghost btn-sm"
								aria-label={`Valg for ${category.name}`}
							>
								<EllipsisVertical size={18} aria-hidden="true" />
							</summary>
							<ul
								class="menu dropdown-content z-20 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
							>
								<li>
									<button
										type="button"
										disabled={!canWrite}
										onclick={() => {
											closeMenus();
											oneditcategory(category);
										}}><Edit3 size={17} aria-hidden="true" /> Rediger</button
									>
								</li>
								<li>
									<button
										type="button"
										disabled={!canWrite || categoryIndex === 0}
										onclick={() => {
											closeMenus();
											void onplacecategory(category.id, categoryIndex - 1);
										}}><ArrowUp size={17} aria-hidden="true" /> Flytt opp</button
									>
								</li>
								<li>
									<button
										type="button"
										disabled={!canWrite || categoryIndex === categories.length - 1}
										onclick={() => {
											closeMenus();
											void onplacecategory(category.id, categoryIndex + 1);
										}}><ArrowDown size={17} aria-hidden="true" /> Flytt ned</button
									>
								</li>
								<li>
									<button
										class="text-error"
										type="button"
										disabled={!canWrite}
										onclick={() => {
											closeMenus();
											void ondeletecategory(category);
										}}><Trash2 size={17} aria-hidden="true" /> Slett</button
									>
								</li>
							</ul>
						</details>
					{/if}
				</div>
			</header>
			{#if section.cards.length}
				<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={`Kort i ${name}`}>
					{#each section.cards as card, index (card.id)}
						<li
							class="rounded-box"
							class:ring-2={dropTarget === card.id}
							class:ring-primary={dropTarget === card.id}
							ondragover={(event) => {
								if (!draggedCardId) return;
								event.preventDefault();
								event.stopPropagation();
								dropTarget = card.id;
							}}
							ondrop={(event) => {
								if (!draggedCardId) return;
								event.preventDefault();
								event.stopPropagation();
								dropOnCard(category?.id ?? null, index);
							}}
						>
							<PlanningCardTile
								{card}
								{accent}
								draggable={canWrite}
								ondragstart={(event) => {
									draggedCardId = card.id;
									startDrag(event, card.id);
								}}
								ondragend={endDrag}
								onopen={() => onopen(card.id)}
							/>
						</li>
					{/each}
				</ul>
			{:else}
				<p
					class="rounded-box border border-dashed border-base-300 px-4 py-5 text-center text-sm text-base-content/55"
				>
					Ingen kort her ennå.
				</p>
			{/if}
		</section>
	{/each}
</div>
