<script lang="ts">
	import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from '@lucide/svelte';
	import { tick } from 'svelte';

	import type { MenuIngredient } from '$lib/modules/menu/domain/menu';
	import {
		baseQuantityFromDisplayedText,
		displayRational,
		parseRational,
		scaledIngredientQuantityText
	} from '$lib/modules/menu/domain/quantities';

	let {
		ingredients = $bindable(),
		ingredientGroups = $bindable(),
		plannedServings,
		baseServings
	}: {
		ingredients: MenuIngredient[];
		ingredientGroups: string[];
		plannedServings: number;
		baseServings: number;
	} = $props();
	let draggedIngredientId = $state<string>();
	const visibleIngredientGroups = $derived(
		ingredients.some((ingredient) => !ingredient.group) || !ingredientGroups.length
			? ['', ...ingredientGroups]
			: ingredientGroups
	);

	function uniqueLabel(prefix: string, existing: readonly string[]): string {
		let index = 1;
		let candidate = prefix;
		while (existing.includes(candidate)) candidate = `${prefix} ${++index}`;
		return candidate;
	}

	async function addIngredient(group = ''): Promise<void> {
		const id = crypto.randomUUID();
		ingredients = [...ingredients, { id, group, quantityText: '', unit: '', name: '', note: '' }];
		await tick();
		document.getElementById(`ingredient-name-${id}`)?.focus();
	}

	function addIngredientGroup(): void {
		const group = uniqueLabel('Ny gruppe', ingredientGroups);
		ingredientGroups = [...ingredientGroups, group];
		void addIngredient(group);
	}

	function renameIngredientGroup(previous: string, nextValue: string): void {
		const next = nextValue.trim();
		if (!next || next === previous || ingredientGroups.includes(next)) return;
		ingredientGroups = ingredientGroups.map((group) => (group === previous ? next : group));
		ingredients = ingredients.map((ingredient) =>
			ingredient.group === previous ? { ...ingredient, group: next } : ingredient
		);
	}

	function removeIngredientGroup(group: string): void {
		ingredientGroups = ingredientGroups.filter((candidate) => candidate !== group);
		ingredients = ingredients.map((ingredient) =>
			ingredient.group === group ? { ...ingredient, group: '' } : ingredient
		);
	}

	function dropIngredient(group: string): void {
		if (!draggedIngredientId) return;
		ingredients = ingredients.map((ingredient) =>
			ingredient.id === draggedIngredientId ? { ...ingredient, group } : ingredient
		);
		draggedIngredientId = undefined;
	}

	function updateIngredient(id: string, field: keyof MenuIngredient, value: string): void {
		const index = ingredients.findIndex((ingredient) => ingredient.id === id);
		const row = ingredients[index];
		if (!row) return;
		const next = { ...row, [field]: value };
		if (field === 'quantityText') {
			const normalizedQuantity = parseRational(value);
			if (normalizedQuantity) next.normalizedQuantity = normalizedQuantity;
			else delete next.normalizedQuantity;
		}
		ingredients = ingredients.map((ingredient, rowIndex) =>
			rowIndex === index ? next : ingredient
		);
	}

	function updateDisplayedQuantity(id: string, value: string): void {
		const normalizedQuantity = baseQuantityFromDisplayedText(value, plannedServings, baseServings);
		ingredients = ingredients.map((ingredient) => {
			if (ingredient.id !== id) return ingredient;
			if (!normalizedQuantity) {
				const next = { ...ingredient, quantityText: value };
				delete next.normalizedQuantity;
				return next;
			}
			return {
				...ingredient,
				quantityText: displayRational(normalizedQuantity),
				normalizedQuantity
			};
		});
	}

	function moveIngredient(id: string, offset: number): void {
		const index = ingredients.findIndex((ingredient) => ingredient.id === id);
		const ingredient = ingredients[index];
		if (!ingredient) return;
		const groupIndexes = ingredients.flatMap((candidate, candidateIndex) =>
			candidate.group === ingredient.group ? [candidateIndex] : []
		);
		const target = groupIndexes[groupIndexes.indexOf(index) + offset];
		if (target === undefined) return;
		const next = [...ingredients];
		[next[index], next[target]] = [next[target]!, next[index]!];
		ingredients = next;
	}
</script>

<section class="mt-7" aria-labelledby="ingredients-title">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div>
			<h3 id="ingredients-title" class="font-display text-2xl font-bold">Ingredienser</h3>
			<p class="text-sm text-base-content/55">{ingredients.length} lagt til</p>
		</div>
		<button class="btn min-h-10 btn-outline btn-sm" type="button" onclick={addIngredientGroup}
			><Plus size={16} /> Gruppe</button
		>
	</div>
	<datalist id="menu-unit-options">
		{#each ['stk', 'fedd', 'skive', 'klype', 'ts', 'ss', 'ml', 'cl', 'dl', 'l', 'mg', 'g', 'kg', 'pakke', 'boks'] as unit (unit)}<option
				value={unit}
			></option>{/each}
	</datalist>
	<div class="space-y-3">
		{#each visibleIngredientGroups as group (group)}
			{@const groupIngredients = ingredients.filter((ingredient) => ingredient.group === group)}
			<div
				class="rounded-box border border-base-300 bg-base-200/45 p-2.5 sm:p-3"
				role="group"
				aria-label={group ? `Ingrediensgruppe ${group}` : 'Ingredienser uten gruppe'}
				class:ring-2={draggedIngredientId}
				class:ring-primary={draggedIngredientId}
				ondragover={(event) => event.preventDefault()}
				ondrop={() => dropIngredient(group)}
			>
				<div class="mb-2 flex min-h-10 items-center gap-2 px-1">
					{#if group}<input
							class="input h-10 min-w-0 flex-1 input-ghost px-1 font-bold"
							value={group}
							onchange={(event) => renameIngredientGroup(group, event.currentTarget.value)}
							aria-label={`Navn på ingrediensgruppe ${group}`}
						/>{:else}<p class="min-w-0 flex-1 text-sm font-bold text-base-content/60">
							Uten gruppe
						</p>{/if}
					{#if group}<button
							class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost text-error btn-sm"
							type="button"
							onclick={() => removeIngredientGroup(group)}
							aria-label={`Fjern ingrediensgruppe ${group}`}><Trash2 size={17} /></button
						>{/if}
				</div>
				<div class="space-y-2">
					{#each groupIngredients as ingredient, index (ingredient.id)}
						<div
							class="rounded-box border border-base-300 bg-base-100 p-2.5 shadow-sm sm:p-3"
							data-testid="ingredient-row"
						>
							<div class="mb-2 flex items-center gap-1">
								<button
									class="btn hidden btn-square h-10 min-h-10 w-10 min-w-10 cursor-grab btn-ghost btn-sm sm:inline-flex"
									type="button"
									draggable="true"
									ondragstart={() => (draggedIngredientId = ingredient.id)}
									ondragend={() => (draggedIngredientId = undefined)}
									aria-label="Dra ingrediens til en annen gruppe"><GripVertical size={17} /></button
								>
								<p class="min-w-0 flex-1 text-sm font-bold text-base-content/55">
									Ingrediens {index + 1}
								</p>
								<button
									class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
									type="button"
									disabled={index === 0}
									onclick={() => moveIngredient(ingredient.id, -1)}
									aria-label="Flytt ingrediens opp"><ArrowUp size={17} /></button
								>
								<button
									class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
									type="button"
									disabled={index === groupIngredients.length - 1}
									onclick={() => moveIngredient(ingredient.id, 1)}
									aria-label="Flytt ingrediens ned"><ArrowDown size={17} /></button
								>
								<button
									class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost text-error btn-sm"
									type="button"
									onclick={() =>
										(ingredients = ingredients.filter(
											(candidate) => candidate.id !== ingredient.id
										))}
									aria-label="Slett ingrediens"><Trash2 size={17} /></button
								>
							</div>
							<input
								id={`ingredient-name-${ingredient.id}`}
								class="input-bordered input w-full font-semibold"
								value={ingredient.name}
								oninput={(event) =>
									updateIngredient(ingredient.id, 'name', event.currentTarget.value)}
								placeholder="Ingrediens"
								aria-label={`Ingrediens ${ingredient.id}`}
							/>
							<div class="mt-2 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
								<input
									class="input-bordered input min-w-0"
									value={scaledIngredientQuantityText(ingredient, plannedServings, baseServings)}
									oninput={(event) =>
										updateDisplayedQuantity(ingredient.id, event.currentTarget.value)}
									placeholder="Mengde"
									aria-label={`Mengde ${ingredient.id}`}
								/><input
									class="input-bordered input min-w-0"
									list="menu-unit-options"
									value={ingredient.unit}
									oninput={(event) =>
										updateIngredient(ingredient.id, 'unit', event.currentTarget.value)}
									placeholder="Enhet"
									aria-label={`Enhet ${ingredient.id}`}
								/>
							</div>
							<details
								class="mt-2 rounded-field bg-base-200/60 px-3 py-2"
								open={Boolean(ingredient.note)}
							>
								<summary class="cursor-pointer text-sm font-semibold text-base-content/65">
									Merknad og gruppe
								</summary>
								<div class="mt-2 grid gap-2 sm:grid-cols-2">
									<input
										class="input-bordered input w-full"
										value={ingredient.note}
										oninput={(event) =>
											updateIngredient(ingredient.id, 'note', event.currentTarget.value)}
										placeholder="Merknad"
										aria-label={`Merknad ${ingredient.id}`}
									/>
									{#if ingredientGroups.length}<select
											class="select-bordered select w-full"
											value={ingredient.group}
											onchange={(event) =>
												updateIngredient(ingredient.id, 'group', event.currentTarget.value)}
											aria-label="Flytt ingrediens til gruppe"
											><option value="">Uten gruppe</option
											>{#each ingredientGroups as candidate (candidate)}<option value={candidate}
													>{candidate}</option
												>{/each}</select
										>{/if}
								</div>
							</details>
						</div>
					{/each}
					<button
						class="btn mt-1 min-h-11 w-full border-dashed border-base-300 btn-ghost btn-sm"
						type="button"
						onclick={() => void addIngredient(group)}><Plus size={17} /> Ingrediens</button
					>
				</div>
			</div>
		{/each}
	</div>
</section>
