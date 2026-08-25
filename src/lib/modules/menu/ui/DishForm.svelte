<script lang="ts">
	import { ArrowDown, ArrowUp, Download, GripVertical, Plus, Trash2, X } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';

	import {
		matchingArchives,
		mealCategories,
		type MealCategory,
		type MenuArchive,
		type MenuEditorValue,
		type MenuIngredient,
		type MenuInstruction
	} from '$lib/modules/menu/domain/menu';
	import {
		baseQuantityFromDisplayedText,
		displayRational,
		parseRational,
		scaledIngredientQuantityText
	} from '$lib/modules/menu/domain/quantities';

	let {
		initial,
		archives,
		isNew,
		manageMenu,
		onCancel,
		onSave,
		onImport,
		onUseExisting
	}: {
		initial: MenuEditorValue;
		archives: readonly MenuArchive[];
		isNew: boolean;
		manageMenu: boolean;
		onCancel: () => void;
		onSave: (value: MenuEditorValue) => Promise<void>;
		onImport: (url: string) => Promise<Partial<MenuEditorValue> | undefined>;
		onUseExisting: (archive: MenuArchive) => void;
	} = $props();

	const seed = untrack(() => $state.snapshot(initial));
	let name = $state(seed.name);
	let sourceUrl = $state(seed.sourceUrl ?? '');
	let imageUrl = $state(seed.imageUrl ?? '');
	let sourceYield = $state(seed.sourceYield ?? '');
	let baseServings = $state(seed.baseServings);
	let plannedServings = $state(seed.plannedServings);
	let categories = $state<MealCategory[]>(seed.categories);
	let ingredients = $state<MenuIngredient[]>(seed.ingredients);
	let instructions = $state<MenuInstruction[]>(seed.instructions);
	let ingredientGroups = $state([
		...new Set(seed.ingredients.map((ingredient) => ingredient.group).filter(Boolean))
	]);
	let instructionSections = $state([
		...new Set(seed.instructions.map((instruction) => instruction.section).filter(Boolean))
	]);
	let draggedIngredientId = $state<string>();
	let draggedInstructionId = $state<string>();
	let saving = $state(false);
	let importing = $state(false);
	let error = $state('');

	const categoryLabels: Record<MealCategory, string> = {
		breakfast: 'Frokost',
		lunch: 'Lunsj',
		dinner: 'Middag'
	};
	const matches = $derived(isNew ? matchingArchives(archives, name, sourceUrl) : []);
	const visibleIngredientGroups = $derived(
		ingredients.some((ingredient) => !ingredient.group) || !ingredientGroups.length
			? ['', ...ingredientGroups]
			: ingredientGroups
	);
	const visibleInstructionSections = $derived(
		instructions.some((instruction) => !instruction.section) || !instructionSections.length
			? ['', ...instructionSections]
			: instructionSections
	);

	function toggleCategory(category: MealCategory): void {
		categories = categories.includes(category)
			? categories.filter((value) => value !== category)
			: [...categories, category];
	}

	function uniqueLabel(prefix: string, existing: readonly string[]): string {
		let index = 1;
		let candidate = prefix;
		while (existing.includes(candidate)) {
			index += 1;
			candidate = `${prefix} ${index}`;
		}
		return candidate;
	}

	async function addIngredient(group = ''): Promise<void> {
		const id = crypto.randomUUID();
		ingredients = [
			...ingredients,
			{
				id,
				group,
				quantityText: '',
				unit: '',
				name: '',
				note: ''
			}
		];
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
		const groupIndex = groupIndexes.indexOf(index);
		const target = groupIndexes[groupIndex + offset];
		if (target === undefined) return;
		const next = [...ingredients];
		[next[index], next[target]] = [next[target]!, next[index]!];
		ingredients = next;
	}

	async function addInstruction(section = ''): Promise<void> {
		const id = crypto.randomUUID();
		instructions = [...instructions, { id, section, text: '' }];
		await tick();
		document.getElementById(`instruction-text-${id}`)?.focus();
	}

	function addInstructionSection(): void {
		const section = uniqueLabel('Ny del', instructionSections);
		instructionSections = [...instructionSections, section];
		void addInstruction(section);
	}

	function renameInstructionSection(previous: string, nextValue: string): void {
		const next = nextValue.trim();
		if (!next || next === previous || instructionSections.includes(next)) return;
		instructionSections = instructionSections.map((section) =>
			section === previous ? next : section
		);
		instructions = instructions.map((instruction) =>
			instruction.section === previous ? { ...instruction, section: next } : instruction
		);
	}

	function removeInstructionSection(section: string): void {
		instructionSections = instructionSections.filter((candidate) => candidate !== section);
		instructions = instructions.map((instruction) =>
			instruction.section === section ? { ...instruction, section: '' } : instruction
		);
	}

	function dropInstruction(section: string): void {
		if (!draggedInstructionId) return;
		instructions = instructions.map((instruction) =>
			instruction.id === draggedInstructionId ? { ...instruction, section } : instruction
		);
		draggedInstructionId = undefined;
	}

	function updateInstruction(id: string, field: 'section' | 'text', value: string): void {
		instructions = instructions.map((instruction) =>
			instruction.id === id ? { ...instruction, [field]: value } : instruction
		);
	}

	function moveInstruction(id: string, offset: number): void {
		const index = instructions.findIndex((instruction) => instruction.id === id);
		const instruction = instructions[index];
		if (!instruction) return;
		const sectionIndexes = instructions.flatMap((candidate, candidateIndex) =>
			candidate.section === instruction.section ? [candidateIndex] : []
		);
		const sectionIndex = sectionIndexes.indexOf(index);
		const target = sectionIndexes[sectionIndex + offset];
		if (target === undefined) return;
		const next = [...instructions];
		[next[index], next[target]] = [next[target]!, next[index]!];
		instructions = next;
	}

	async function importRecipe(): Promise<void> {
		if (!sourceUrl.trim() || importing) return;
		importing = true;
		error = '';
		try {
			const draft = await onImport(sourceUrl.trim());
			if (!draft) return;
			name = draft.name ?? name;
			imageUrl = draft.imageUrl ?? imageUrl;
			sourceYield = draft.sourceYield ?? sourceYield;
			baseServings = draft.baseServings ?? baseServings;
			plannedServings = draft.plannedServings ?? draft.defaultPlannedServings ?? plannedServings;
			ingredients = draft.ingredients ?? ingredients;
			instructions = draft.instructions ?? instructions;
			ingredientGroups = [
				...new Set(ingredients.map((ingredient) => ingredient.group).filter(Boolean))
			];
			instructionSections = [
				...new Set(instructions.map((instruction) => instruction.section).filter(Boolean))
			];
		} catch {
			error = 'Oppskriften kunne ikke importeres. Du kan fylle inn resten manuelt.';
		} finally {
			importing = false;
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!name.trim() || (manageMenu && categories.length === 0) || saving) return;
		saving = true;
		error = '';
		try {
			await onSave({
				name: name.trim(),
				...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
				...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
				...(sourceYield.trim() ? { sourceYield: sourceYield.trim() } : {}),
				baseServings,
				defaultPlannedServings: plannedServings,
				plannedServings,
				categories,
				ingredients: ingredients.filter((ingredient) => ingredient.name.trim()),
				instructions: instructions.filter((instruction) => instruction.text.trim())
			});
		} catch {
			error = 'Kunne ikke lagre retten. Kontroller feltene og prøv igjen.';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="modal modal-open z-[100] p-0 sm:p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="dish-form-title"
>
	<form
		class="modal-box flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col rounded-none p-0 sm:h-auto sm:max-h-[94dvh] sm:rounded-box"
		onsubmit={submit}
	>
		<header
			class="shrink-0 border-b border-base-300 bg-base-100 px-4 pb-3 sm:px-6 sm:pt-5"
			style="padding-top: max(1rem, env(safe-area-inset-top));"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-xs font-bold tracking-wide text-primary uppercase">
						{isNew ? 'Ny rett' : 'Rediger rett'}
					</p>
					<h2 id="dish-form-title" class="font-display truncate text-2xl font-bold">Oppskrift</h2>
				</div>
				<button
					class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
					type="button"
					onclick={onCancel}
					aria-label="Lukk skjemaet"><X size={21} /></button
				>
			</div>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="form-control sm:col-span-2"
					><span class="label-text mb-1 font-semibold">Navn</span><input
						class="input-bordered input w-full"
						bind:value={name}
						maxlength="200"
						autocomplete="off"
						required
					/></label
				>
				<label class="form-control sm:col-span-2">
					<span class="label-text mb-1 font-semibold">Lenke til oppskrift</span>
					<div class="join w-full">
						<input
							class="input-bordered input join-item min-w-0 flex-1"
							bind:value={sourceUrl}
							type="url"
							inputmode="url"
							placeholder="https://…"
						/><button
							class="btn join-item btn-outline"
							type="button"
							disabled={!sourceUrl || importing}
							onclick={importRecipe}
							><Download class={importing ? 'animate-pulse' : ''} size={18} /> Importer</button
						>
					</div>
				</label>
				{#if matches.length}
					<div class="alert alert-warning sm:col-span-2">
						<div>
							<p class="font-bold">Mulig eksisterende rett</p>
							{#each matches as match (match.id)}<button
									class="btn h-auto min-h-0 btn-link px-0 py-1 text-left"
									type="button"
									onclick={() => onUseExisting(match)}>Bruk {match.name} fra Arkiv</button
								>{/each}
						</div>
					</div>
				{/if}
				<label class="block"
					><span class="label-text mb-1 block font-semibold">Oppskriften er for</span><input
						class="input-bordered input w-full"
						bind:value={baseServings}
						type="number"
						inputmode="numeric"
						min="1"
						max="500"
						required
					/></label
				>
				<label class="block"
					><span class="label-text mb-1 block font-semibold">Porsjoner i menyen</span><input
						class="input-bordered input w-full"
						bind:value={plannedServings}
						type="number"
						inputmode="numeric"
						min="1"
						max="500"
						required
					/></label
				>
			</div>

			<details class="mt-4 rounded-box border border-base-300 bg-base-200/45 p-3">
				<summary class="cursor-pointer text-sm font-semibold">Flere oppskriftsdetaljer</summary>
				<label class="form-control mt-3"
					><span class="label-text mb-1 font-semibold">Bildelenke</span><input
						class="input-bordered input w-full"
						bind:value={imageUrl}
						type="url"
						inputmode="url"
						placeholder="https://…"
					/></label
				>
			</details>

			{#if manageMenu}<fieldset class="mt-5">
					<legend class="mb-2 font-bold">Vis i</legend>
					<div class="grid grid-cols-3 gap-2">
						{#each mealCategories as category (category)}<label
								class="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-field border border-base-300 bg-base-100 px-2 text-sm font-semibold has-checked:border-primary has-checked:bg-primary/10"
								><input
									class="checkbox checkbox-sm checkbox-primary"
									type="checkbox"
									checked={categories.includes(category)}
									onchange={() => toggleCategory(category)}
								/><span>{categoryLabels[category]}</span></label
							>{/each}
					</div>
				</fieldset>{/if}

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
						{@const groupIngredients = ingredients.filter(
							(ingredient) => ingredient.group === group
						)}
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
												aria-label="Dra ingrediens til en annen gruppe"
												><GripVertical size={17} /></button
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
												value={scaledIngredientQuantityText(
													ingredient,
													plannedServings,
													baseServings
												)}
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
														>{#each ingredientGroups as candidate (candidate)}<option
																value={candidate}>{candidate}</option
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

			<section class="mt-8" aria-labelledby="instructions-title">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div>
						<h3 id="instructions-title" class="font-display text-2xl font-bold">Fremgangsmåte</h3>
						<p class="text-sm text-base-content/55">{instructions.length} steg</p>
					</div>
					<button
						class="btn min-h-10 btn-outline btn-sm"
						type="button"
						onclick={addInstructionSection}><Plus size={16} /> Del</button
					>
				</div>
				<div class="space-y-3">
					{#each visibleInstructionSections as section (section)}
						{@const sectionInstructions = instructions.filter(
							(instruction) => instruction.section === section
						)}
						<div
							class="rounded-box border border-base-300 bg-base-200/45 p-2.5 sm:p-3"
							role="group"
							aria-label={section ? `Oppskriftsdel ${section}` : 'Steg uten del'}
							class:ring-2={draggedInstructionId}
							class:ring-primary={draggedInstructionId}
							ondragover={(event) => event.preventDefault()}
							ondrop={() => dropInstruction(section)}
						>
							<div class="mb-2 flex min-h-10 items-center gap-2 px-1">
								{#if section}<input
										class="input h-10 min-w-0 flex-1 input-ghost px-1 font-bold"
										value={section}
										onchange={(event) =>
											renameInstructionSection(section, event.currentTarget.value)}
										aria-label={`Navn på oppskriftsdel ${section}`}
									/>{:else}<p class="min-w-0 flex-1 text-sm font-bold text-base-content/60">
										Uten del
									</p>{/if}
								{#if section}<button
										class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost text-error btn-sm"
										type="button"
										onclick={() => removeInstructionSection(section)}
										aria-label={`Fjern oppskriftsdel ${section}`}><Trash2 size={17} /></button
									>{/if}
							</div>
							<div class="space-y-2">
								{#each sectionInstructions as instruction, index (instruction.id)}
									<div
										class="rounded-box border border-base-300 bg-base-100 p-2.5 shadow-sm sm:p-3"
										data-testid="instruction-row"
									>
										<div class="mb-2 flex items-center gap-1">
											<button
												class="btn hidden btn-square h-10 min-h-10 w-10 min-w-10 cursor-grab btn-ghost btn-sm sm:inline-flex"
												type="button"
												draggable="true"
												ondragstart={() => (draggedInstructionId = instruction.id)}
												ondragend={() => (draggedInstructionId = undefined)}
												aria-label="Dra steg til en annen del"><GripVertical size={17} /></button
											>
											<p class="min-w-0 flex-1 text-sm font-bold text-base-content/55">
												Steg {index + 1}
											</p>
											<button
												class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
												type="button"
												disabled={index === 0}
												onclick={() => moveInstruction(instruction.id, -1)}
												aria-label="Flytt steg opp"><ArrowUp size={17} /></button
											>
											<button
												class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
												type="button"
												disabled={index === sectionInstructions.length - 1}
												onclick={() => moveInstruction(instruction.id, 1)}
												aria-label="Flytt steg ned"><ArrowDown size={17} /></button
											>
											<button
												class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost text-error btn-sm"
												type="button"
												onclick={() =>
													(instructions = instructions.filter(
														(candidate) => candidate.id !== instruction.id
													))}
												aria-label="Slett steg"><Trash2 size={17} /></button
											>
										</div>
										<textarea
											id={`instruction-text-${instruction.id}`}
											class="textarea-bordered textarea [field-sizing:content] min-h-28 w-full"
											value={instruction.text}
											oninput={(event) =>
												updateInstruction(instruction.id, 'text', event.currentTarget.value)}
											maxlength="4000"
											placeholder="Beskriv steget"
											aria-label={`Steg ${instruction.id}`}></textarea>
										{#if instructionSections.length}<select
												class="select-bordered select mt-2 w-full"
												value={instruction.section}
												onchange={(event) =>
													updateInstruction(instruction.id, 'section', event.currentTarget.value)}
												aria-label="Flytt steg til del"
												><option value="">Uten del</option
												>{#each instructionSections as candidate (candidate)}<option
														value={candidate}>{candidate}</option
													>{/each}</select
											>{/if}
									</div>
								{/each}
								<button
									class="btn mt-1 min-h-11 w-full border-dashed border-base-300 btn-ghost btn-sm"
									type="button"
									onclick={() => void addInstruction(section)}><Plus size={17} /> Steg</button
								>
							</div>
						</div>
					{/each}
				</div>
			</section>

			{#if error}<div class="mt-4 alert alert-error" role="alert">{error}</div>{/if}
		</div>

		<footer
			class="flex shrink-0 items-center gap-2 border-t border-base-300 bg-base-100 px-4 pt-3 sm:px-6 sm:pb-4"
			style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
		>
			<button class="btn min-h-11 btn-ghost" type="button" onclick={onCancel}>Avbryt</button><button
				class="btn min-h-11 flex-1 btn-primary"
				type="submit"
				disabled={saving || !name.trim() || (manageMenu && !categories.length)}
				>{saving ? 'Lagrer …' : 'Lagre'}</button
			>
		</footer>
	</form>
	<button class="modal-backdrop" type="button" onclick={onCancel} aria-label="Lukk skjemaet"
		>Lukk</button
	>
</div>
