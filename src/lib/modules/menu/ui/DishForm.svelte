<script lang="ts">
	import { Download, X } from '@lucide/svelte';
	import { untrack } from 'svelte';

	import {
		matchingArchives,
		mealCategories,
		type MealCategory,
		type MenuArchive,
		type MenuEditorValue,
		type MenuIngredient,
		type MenuInstruction
	} from '$lib/modules/menu/domain/menu';

	import IngredientEditor from './IngredientEditor.svelte';
	import InstructionEditor from './InstructionEditor.svelte';

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
	let saving = $state(false);
	let importing = $state(false);
	let error = $state('');

	const categoryLabels: Record<MealCategory, string> = {
		breakfast: 'Frokost',
		lunch: 'Lunsj',
		dinner: 'Middag'
	};
	const matches = $derived(isNew ? matchingArchives(archives, name, sourceUrl) : []);

	function toggleCategory(category: MealCategory): void {
		categories = categories.includes(category)
			? categories.filter((value) => value !== category)
			: [...categories, category];
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

			<IngredientEditor bind:ingredients bind:ingredientGroups {plannedServings} {baseServings} />

			<InstructionEditor bind:instructions bind:instructionSections />

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
