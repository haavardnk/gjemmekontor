<script lang="ts">
	import { Archive, ChefHat, Plus, Utensils, WifiOff } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { apiRequest } from '$lib/client/api';
	import { createOfflineResource } from '$lib/client/offline-resource';
	import { watchOnlineStatus } from '$lib/client/online';
	import { sharedState } from '$lib/client/state.svelte';
	import {
		mealCategories,
		type MealCategory,
		type MenuArchive,
		type MenuEditorValue,
		menuPageDataSchema,
		type RecipeArchiveView,
		type TripMenuDish
	} from '$lib/modules/menu/domain/menu';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import DishForm from './DishForm.svelte';
	import {
		activateMenuArchive,
		archiveMenuRecipe,
		consumeMenuDish,
		emptyMenuEditor,
		type MenuCommandIdentity,
		type MenuEditingContext,
		menuEditorFor,
		menuEditorForExistingArchive,
		moveMenuDish,
		reorderMenuDish,
		saveMenuEditor,
		useLatestMenuRecipe
	} from './menu-commands';
	import { mealCategoryLabels as labels } from './menu-labels';
	import MenuBoard from './MenuBoard.svelte';
	import RecipeArchive from './RecipeArchive.svelte';
	import RecipeView from './RecipeView.svelte';
	import ShoppingPreview from './ShoppingPreview.svelte';

	let { archives, dishes }: { archives: RecipeArchiveView[]; dishes: TripMenuDish[] } = $props();

	let view = $state<'menu' | 'archive'>('menu');
	let mobileCategory = $state<MealCategory>('breakfast');
	let query = $state('');
	let online = $state(true);
	let editing = $state<MenuEditingContext>();
	let recipe = $state<{ archive: MenuArchive; plannedServings: number }>();
	let activating = $state<RecipeArchiveView>();
	let activationCategories = $state<MealCategory[]>(['dinner']);
	let activationServings = $state(4);
	let shoppingScope = $state<{ scope: 'dish' | 'menu'; dishes: TripMenuDish[] }>();
	const resource = createOfflineResource({
		moduleId: 'menu',
		snapshotKey: 'menu:snapshot:current',
		endpoint: '/api/menu',
		schema: menuPageDataSchema,
		read: () => ({ archives, dishes }),
		write: (value) => {
			archives = value.archives;
			dishes = value.dishes;
		}
	});

	const activeById = $derived(new Map(dishes.map((dish) => [dish.archive.id, dish.active])));
	const dishById = $derived(new Map(dishes.map((dish) => [dish.archive.id, dish])));
	const latestArchiveById = $derived(new Map(archives.map((archive) => [archive.id, archive])));
	const normalizedQuery = $derived(query.trim().toLocaleLowerCase('nb-NO'));
	const filteredArchives = $derived(
		archives.filter((archive) =>
			`${archive.name} ${archive.ingredients.map((ingredient) => ingredient.name).join(' ')}`
				.toLocaleLowerCase('nb-NO')
				.includes(normalizedQuery)
		)
	);

	async function commandIdentity(): Promise<MenuCommandIdentity> {
		return {
			clientId: await sharedState.clientId(),
			now: new Date().toISOString(),
			randomId: () => crypto.randomUUID()
		};
	}

	async function saveEditor(value: MenuEditorValue): Promise<void> {
		const context = editing;
		if (!context) return;
		await resource.commitMutation(
			saveMenuEditor(resource.current(), context, value, await commandIdentity())
		);
		editing = undefined;
		if (context.activateOnSave) view = 'menu';
	}

	async function importRecipe(url: string): Promise<Partial<MenuEditorValue> | undefined> {
		if (!online) throw new Error('OFFLINE');
		return apiRequest<Partial<MenuEditorValue>>('/api/menu/import', {
			method: 'POST',
			json: { url },
			signal: AbortSignal.timeout(20_000)
		});
	}

	function openActivation(archive: RecipeArchiveView): void {
		activating = archive;
		activationCategories = ['dinner'];
		activationServings = archive.defaultPlannedServings;
	}

	async function activate(): Promise<void> {
		if (!activating || !activationCategories.length) return;
		await resource.commitMutation(
			activateMenuArchive(
				resource.current(),
				activating,
				activationCategories,
				activationServings,
				await commandIdentity()
			)
		);
		activating = undefined;
		view = 'menu';
	}

	async function consume(dish: TripMenuDish, category: MealCategory): Promise<void> {
		const final = dish.active.categories.length === 1;
		if (
			!window.confirm(
				final
					? `Er ${dish.archive.name} spist til ${labels[category].toLocaleLowerCase('nb-NO')}? Retten fjernes fra Meny, men blir liggende i Arkiv.`
					: `Er ${dish.archive.name} spist til ${labels[category].toLocaleLowerCase('nb-NO')}?`
			)
		)
			return;
		await resource.commitMutation(consumeMenuDish(resource.current(), dish, category));
	}

	async function move(dish: TripMenuDish, from: MealCategory, to: MealCategory): Promise<void> {
		await resource.commitMutation(moveMenuDish(resource.current(), dish, from, to));
	}

	async function reorder(
		dish: TripMenuDish,
		category: MealCategory,
		offset: -1 | 1
	): Promise<void> {
		const mutation = reorderMenuDish(resource.current(), dish, category, offset);
		if (mutation) await resource.commitMutation(mutation);
	}

	async function archiveRecipe(archive: RecipeArchiveView): Promise<void> {
		const active = activeById.get(archive.id);
		const message = active
			? `Arkivere ${archive.name}? Den skjules i Arkiv, men blir liggende i denne menyen.`
			: `Arkivere ${archive.name}? Oppskriften kan ikke velges på nye reiser.`;
		if (!window.confirm(message)) return;
		await resource.commitMutation(archiveMenuRecipe(resource.current(), archive.id));
	}

	async function useLatestRecipe(dish: TripMenuDish): Promise<void> {
		const latest = latestArchiveById.get(dish.archive.id);
		await resource.commitMutation(useLatestMenuRecipe(resource.current(), dish, latest));
	}

	function useExisting(archive: MenuArchive): void {
		editing = undefined;
		const result = menuEditorForExistingArchive(archives, dishes, archive);
		if (!result) return;
		if ('activate' in result) openActivation(result.activate);
		else editing = result;
	}

	function showDishRecipe(dish: TripMenuDish): void {
		recipe = { archive: dish.archive, plannedServings: dish.active.plannedServings };
	}

	function showArchiveRecipe(archive: RecipeArchiveView, dish?: TripMenuDish): void {
		recipe = {
			archive,
			plannedServings: dish?.active.plannedServings ?? archive.defaultPlannedServings
		};
	}

	function openDishEditor(dish: TripMenuDish): void {
		const archive = latestArchiveById.get(dish.archive.id) ?? dish.archive;
		editing = {
			archive,
			active: dish.active,
			entryId: dish.entryId,
			activateOnSave: true,
			initial: menuEditorFor(archive, dish.active)
		};
	}

	function openArchiveEditor(archive: RecipeArchiveView, dish?: TripMenuDish): void {
		editing = {
			archive,
			active: dish?.active,
			entryId: dish?.entryId,
			activateOnSave: Boolean(dish),
			initial: menuEditorFor(archive, dish?.active)
		};
	}

	function openShopping(scope: 'dish' | 'menu', selectedDishes: TripMenuDish[]): void {
		shoppingScope = { scope, dishes: selectedDishes };
	}

	function toggleActivationCategory(category: MealCategory): void {
		activationCategories = activationCategories.includes(category)
			? activationCategories.filter((value) => value !== category)
			: [...activationCategories, category];
	}

	onMount(() => {
		const stopOnline = watchOnlineStatus((value) => (online = value));
		const stopResource = resource.start();
		return (): void => {
			stopResource();
			stopOnline();
		};
	});
</script>

<svelte:head><title>Meny · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-7xl px-4 py-5 pb-10 lg:px-6 lg:py-7">
	<header class="mb-4">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
				<Utensils size={15} /> Mat om bord
			</p>
			<SyncStatus moduleId="menu" />
		</div>
		<div class="mt-1 flex items-end justify-between gap-3">
			<h1 class="font-display text-3xl font-bold text-neutral">Meny</h1>
			<button
				class="btn btn-primary btn-sm"
				type="button"
				onclick={() => (editing = { activateOnSave: true, initial: emptyMenuEditor() })}
				><Plus size={17} /> Ny rett</button
			>
		</div>
	</header>

	{#if !online}<div class="mb-4 alert py-2 text-sm">
			<WifiOff size={17} /><span
				>Oppskrifter og menyvalg virker uten nett. Import og Handleliste krever nett.</span
			>
		</div>{/if}

	<div class="tabs tabs-box mb-3 h-9 w-full p-0.5" role="tablist" aria-label="Menyvisning">
		<button
			class="tab h-8 flex-1 gap-1.5 text-sm"
			class:tab-active={view === 'menu'}
			role="tab"
			aria-selected={view === 'menu'}
			onclick={() => (view = 'menu')}><ChefHat size={15} /> Meny</button
		><button
			class="tab h-8 flex-1 gap-1.5 text-sm"
			class:tab-active={view === 'archive'}
			role="tab"
			aria-selected={view === 'archive'}
			onclick={() => (view = 'archive')}><Archive size={15} /> Arkiv</button
		>
	</div>

	{#if view === 'menu'}
		<MenuBoard
			{dishes}
			bind:mobileCategory
			onshopping={openShopping}
			onrecipe={showDishRecipe}
			onmove={move}
			onreorder={reorder}
			onedit={openDishEditor}
			onconsume={consume}
			onuseLatest={useLatestRecipe}
		/>
	{:else}
		<RecipeArchive
			archives={filteredArchives}
			{dishById}
			bind:query
			onrecipe={showArchiveRecipe}
			onactivate={openActivation}
			onedit={openArchiveEditor}
			onarchive={archiveRecipe}
		/>
	{/if}
</section>

{#if editing}{#key `${editing.archive?.id ?? 'new'}-${editing.active?.cycleId ?? ''}`}<DishForm
			initial={editing.initial}
			{archives}
			isNew={!editing.archive}
			manageMenu={editing.activateOnSave}
			onCancel={() => (editing = undefined)}
			onSave={saveEditor}
			onImport={importRecipe}
			onUseExisting={useExisting}
		/>{/key}{/if}
{#if recipe}<RecipeView
		archive={recipe.archive}
		plannedServings={recipe.plannedServings}
		onClose={() => (recipe = undefined)}
	/>{/if}
{#if shoppingScope}<ShoppingPreview
		scope={shoppingScope.scope}
		dishes={shoppingScope.dishes}
		onClose={() => (shoppingScope = undefined)}
	/>{/if}
{#if activating}<div
		class="modal modal-open"
		role="dialog"
		aria-modal="true"
		aria-labelledby="activate-title"
	>
		<div class="modal-box">
			<h2 id="activate-title" class="font-display text-2xl font-bold">
				Legg til {activating.name}
			</h2>
			<fieldset class="mt-4">
				<legend class="mb-2 font-bold">Vis i</legend
				>{#each mealCategories as category (category)}<label
						class="label cursor-pointer justify-start gap-3"
						><input
							class="checkbox checkbox-primary"
							type="checkbox"
							checked={activationCategories.includes(category)}
							onchange={() => toggleActivationCategory(category)}
						/>{labels[category]}</label
					>{/each}
			</fieldset>
			<label class="form-control mt-4"
				><span class="label-text mb-1 font-bold">Porsjoner</span><input
					class="input-bordered input"
					type="number"
					min="1"
					max="500"
					bind:value={activationServings}
				/></label
			>
			<div class="modal-action">
				<button class="btn btn-ghost" type="button" onclick={() => (activating = undefined)}
					>Avbryt</button
				><button
					class="btn btn-primary"
					type="button"
					disabled={!activationCategories.length}
					onclick={activate}>Legg til</button
				>
			</div>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (activating = undefined)}
			>Lukk</button
		>
	</div>{/if}
