<script lang="ts">
	import {
		Archive,
		ArrowDown,
		ArrowUp,
		BookOpen,
		Check,
		ChefHat,
		Edit3,
		EllipsisVertical,
		Plus,
		Search,
		ShoppingBasket,
		Utensils,
		WifiOff
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { sharedState } from '$lib/client/state.svelte';
	import {
		consumeDishCategory,
		mealCategories,
		type MealCategory,
		type MenuActive,
		menuActiveSchema,
		type MenuArchive,
		menuArchiveSchema,
		type MenuEditorValue,
		moveDishCategory,
		orderedDishesInCategory,
		reactivateDish,
		type RecipeArchiveView,
		serializeMenuActive,
		type TripMenuDish
	} from '$lib/modules/menu/domain/menu';

	import DishForm from './DishForm.svelte';
	import RecipeView from './RecipeView.svelte';
	import ShoppingPreview from './ShoppingPreview.svelte';

	type EditingContext = {
		archive?: RecipeArchiveView;
		active?: MenuActive;
		entryId?: string;
		activateOnSave: boolean;
		initial: MenuEditorValue;
	};

	let { archives, dishes }: { archives: RecipeArchiveView[]; dishes: TripMenuDish[] } = $props();

	let view = $state<'menu' | 'archive'>('menu');
	let mobileCategory = $state<MealCategory>('breakfast');
	let query = $state('');
	let online = $state(true);
	let editing = $state<EditingContext>();
	let recipe = $state<{ archive: MenuArchive; plannedServings: number }>();
	let activating = $state<RecipeArchiveView>();
	let activationCategories = $state<MealCategory[]>(['dinner']);
	let activationServings = $state(4);
	let shoppingScope = $state<{ scope: 'dish' | 'menu'; dishes: TripMenuDish[] }>();

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

	const labels: Record<MealCategory, string> = {
		breakfast: 'Frokost',
		lunch: 'Lunsj',
		dinner: 'Middag'
	};

	function emptyEditor(): MenuEditorValue {
		return {
			name: '',
			baseServings: 4,
			defaultPlannedServings: 4,
			plannedServings: 4,
			categories: ['dinner'],
			ingredients: [],
			instructions: []
		};
	}

	function editorFor(archive: RecipeArchiveView, active?: MenuActive): MenuEditorValue {
		return {
			name: archive.name,
			...(archive.sourceUrl ? { sourceUrl: archive.sourceUrl } : {}),
			...(archive.imageUrl ? { imageUrl: archive.imageUrl } : {}),
			...(archive.sourceYield ? { sourceYield: archive.sourceYield } : {}),
			baseServings: archive.baseServings,
			defaultPlannedServings: archive.defaultPlannedServings,
			plannedServings: active?.plannedServings ?? archive.defaultPlannedServings,
			categories: active?.categories ?? ['dinner'],
			ingredients: archive.ingredients,
			instructions: archive.instructions
		};
	}

	async function apiMutation(url: string, method: string, body?: unknown): Promise<void> {
		const response = await fetch(url, {
			method,
			...(body === undefined
				? {}
				: { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
		});
		if (!response.ok) throw new Error('MENU_MUTATION_FAILED');
		await invalidateAll();
	}

	async function saveEditor(value: MenuEditorValue): Promise<void> {
		const context = editing;
		if (!context) return;
		const clientId = await sharedState.clientId();
		const now = new Date().toISOString();
		const id = context.archive?.id ?? crypto.randomUUID();
		const archive = menuArchiveSchema.parse({
			version: 1,
			id,
			name: value.name,
			...(value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}),
			...(value.imageUrl ? { imageUrl: value.imageUrl } : {}),
			...(value.sourceYield ? { sourceYield: value.sourceYield } : {}),
			baseServings: value.baseServings,
			defaultPlannedServings: value.defaultPlannedServings,
			ingredients: value.ingredients,
			instructions: value.instructions,
			createdAt: context.archive?.createdAt ?? now,
			createdBy: context.archive?.createdBy ?? clientId,
			tombstone: false
		});
		const active = context.active
			? menuActiveSchema.parse({
					version: 1,
					archiveId: id,
					cycleId: context.active.cycleId,
					categories: value.categories,
					plannedServings: value.plannedServings,
					activatedAt: context.active.activatedAt,
					activatedBy: context.active.activatedBy,
					...(context.active.categoryOrder ? { categoryOrder: context.active.categoryOrder } : {}),
					...(context.active.shoppingStatus
						? { shoppingStatus: context.active.shoppingStatus }
						: {}),
					tombstone: false
				})
			: reactivateDish(
					id,
					value.categories,
					value.plannedServings,
					now,
					clientId,
					crypto.randomUUID()
				);
		await apiMutation(
			context.archive ? `/api/menu/recipes/${context.archive.id}` : '/api/menu/recipes',
			context.archive ? 'PUT' : 'POST',
			{ recipe: archive }
		);
		if (!context.archive && context.activateOnSave) {
			await apiMutation('/api/menu/entries', 'POST', { active });
		} else if (context.active && context.entryId) {
			await apiMutation(`/api/menu/entries/${context.entryId}`, 'PATCH', { active });
		}
		editing = undefined;
		if (context.activateOnSave) view = 'menu';
	}

	async function importRecipe(url: string): Promise<Partial<MenuEditorValue> | undefined> {
		if (!online) throw new Error('OFFLINE');
		const response = await fetch('/api/menu/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url }),
			signal: AbortSignal.timeout(20_000)
		});
		if (!response.ok) throw new Error('IMPORT_FAILED');
		return (await response.json()) as Partial<MenuEditorValue>;
	}

	function openActivation(archive: RecipeArchiveView): void {
		activating = archive;
		activationCategories = ['dinner'];
		activationServings = archive.defaultPlannedServings;
	}

	async function activate(): Promise<void> {
		if (!activating || !activationCategories.length) return;
		const clientId = await sharedState.clientId();
		const active = reactivateDish(
			activating.id,
			activationCategories,
			activationServings,
			new Date().toISOString(),
			clientId,
			crypto.randomUUID()
		);
		await apiMutation('/api/menu/entries', 'POST', { active });
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
		await apiMutation(`/api/menu/entries/${dish.entryId}`, 'PATCH', {
			active: serializeMenuActive(consumeDishCategory(dish.active, category))
		});
	}

	async function move(dish: TripMenuDish, from: MealCategory, to: MealCategory): Promise<void> {
		await apiMutation(`/api/menu/entries/${dish.entryId}`, 'PATCH', {
			active: serializeMenuActive(moveDishCategory(dish.active, from, to))
		});
	}

	async function reorder(
		dish: TripMenuDish,
		category: MealCategory,
		offset: -1 | 1
	): Promise<void> {
		const categoryDishes = orderedDishesInCategory(dishes, category);
		const currentIndex = categoryDishes.findIndex(
			(candidate) => candidate.archive.id === dish.archive.id
		);
		const targetIndex = currentIndex + offset;
		if (currentIndex < 0 || targetIndex < 0 || targetIndex >= categoryDishes.length) return;
		const reordered = [...categoryDishes];
		[reordered[currentIndex], reordered[targetIndex]] = [
			reordered[targetIndex]!,
			reordered[currentIndex]!
		];
		for (const [position, candidate] of reordered.entries()) {
			await apiMutation(`/api/menu/entries/${candidate.entryId}`, 'PATCH', {
				active: serializeMenuActive({
					...candidate.active,
					categoryOrder: {
						...candidate.active.categoryOrder,
						[category]: position
					}
				})
			});
		}
	}

	async function archiveRecipe(archive: RecipeArchiveView): Promise<void> {
		const active = activeById.get(archive.id);
		const message = active
			? `Arkivere ${archive.name}? Den skjules i Arkiv, men blir liggende i denne menyen.`
			: `Arkivere ${archive.name}? Oppskriften kan ikke velges på nye reiser.`;
		if (!window.confirm(message)) return;
		await apiMutation(`/api/menu/recipes/${archive.id}`, 'DELETE');
	}

	async function useLatestRecipe(dish: TripMenuDish): Promise<void> {
		await apiMutation(`/api/menu/entries/${dish.entryId}`, 'PATCH', { useLatest: true });
	}

	function useExisting(archive: MenuArchive): void {
		editing = undefined;
		const keyed = archives.find((entry) => entry.id === archive.id);
		if (keyed) {
			const dish = dishById.get(keyed.id);
			if (dish) {
				editing = {
					archive: keyed,
					active: dish.active,
					entryId: dish.entryId,
					activateOnSave: true,
					initial: editorFor(keyed, dish.active)
				};
			} else openActivation(keyed);
		}
	}

	function toggleActivationCategory(category: MealCategory): void {
		activationCategories = activationCategories.includes(category)
			? activationCategories.filter((value) => value !== category)
			: [...activationCategories, category];
	}

	onMount(() => {
		online = navigator.onLine;
		const update = (): void => {
			online = navigator.onLine;
		};
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return (): void => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});
</script>

<svelte:head><title>Meny · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-7xl px-4 py-5 pb-10 lg:px-6 lg:py-7">
	<header class="mb-4">
		<div class="flex h-7 items-center gap-3">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
				<Utensils size={15} /> Mat om bord
			</p>
		</div>
		<div class="mt-1 flex items-end justify-between gap-3">
			<h1 class="font-display text-3xl font-bold text-neutral">Meny</h1>
			<button
				class="btn btn-primary btn-sm"
				type="button"
				onclick={() => (editing = { activateOnSave: true, initial: emptyEditor() })}
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
		<div class="mb-3 flex sm:justify-end">
			<button
				class="btn min-h-10 w-full btn-outline leading-tight btn-sm sm:w-auto"
				type="button"
				disabled={!online || !dishes.length}
				onclick={() => (shoppingScope = { scope: 'menu', dishes: [...dishes] })}
				><ShoppingBasket class="shrink-0" size={17} /> Hele menyen til handlelisten</button
			>
		</div>
		<div class="tabs tabs-box mb-3 h-9 p-0.5 lg:hidden" role="tablist" aria-label="Måltid">
			{#each mealCategories as category (category)}<button
					class="tab h-8 flex-1 text-sm"
					class:tab-active={mobileCategory === category}
					role="tab"
					aria-selected={mobileCategory === category}
					onclick={() => (mobileCategory = category)}>{labels[category]}</button
				>{/each}
		</div>
		<div class="grid gap-5 lg:grid-cols-3">
			{#each mealCategories as category (category)}
				{@const categoryDishes = orderedDishesInCategory(dishes, category)}
				<section class:hidden={mobileCategory !== category} class="lg:block">
					<h2 class="font-display mb-3 hidden text-xl font-bold lg:block">{labels[category]}</h2>
					<div class="space-y-3">
						{#each categoryDishes as dish, index (dish.archive.id)}
							<article
								class="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm"
							>
								<div class="relative h-28 bg-base-300">
									<div
										class="absolute inset-0 flex items-center justify-center text-base-content/30"
									>
										<Utensils size={35} />
									</div>
									{#if dish.archive.imageUrl}<img
											class="relative h-full w-full object-cover"
											src={`/api/menu/image?url=${encodeURIComponent(dish.archive.imageUrl)}`}
											alt=""
											loading="lazy"
											onerror={(event) => event.currentTarget.classList.add('hidden')}
										/>{/if}
								</div>
								<div class="p-4">
									<div class="mb-2 flex items-start justify-between gap-3">
										<div>
											<h3 class="font-display text-xl font-bold">{dish.archive.name}</h3>
											<p class="text-sm text-base-content/60">
												{dish.active.plannedServings} porsjoner · {dish.archive.ingredients.length} ingredienser
											</p>
										</div>
										{#if dish.active.shoppingStatus}<span
												class="badge shrink-0 badge-sm whitespace-nowrap badge-success"
												>Lagt til</span
											>{/if}
										{#if dish.archive.recipeVersion < dish.latestRecipeVersion}<button
												class="badge shrink-0 badge-sm badge-warning"
												type="button"
												onclick={() => useLatestRecipe(dish)}
												aria-label={`Bruk nyeste versjon av ${dish.archive.name}`}
												>Ny versjon</button
											>{/if}
									</div>
									<div class="mb-3 flex flex-wrap gap-1">
										{#each dish.active.categories as selected (selected)}<span
												class="badge badge-outline badge-sm">{labels[selected]}</span
											>{/each}
									</div>
									<div class="mb-2 grid grid-cols-2 gap-2">
										<button
											class="btn btn-outline btn-sm"
											type="button"
											onclick={() =>
												(recipe = {
													archive: dish.archive,
													plannedServings: dish.active.plannedServings
												})}><BookOpen size={16} /> Oppskrift</button
										><button
											class="btn btn-outline btn-sm"
											type="button"
											disabled={!online}
											onclick={() => (shoppingScope = { scope: 'dish', dishes: [dish] })}
											><ShoppingBasket size={16} />
											{dish.active.shoppingStatus ? 'Legg til igjen' : 'Handleliste'}</button
										>
									</div>
									<div class="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] gap-1.5">
										<select
											class="select-bordered select select-sm"
											aria-label={`Flytt ${dish.archive.name}`}
											onchange={(event) => {
												const to = event.currentTarget.value as MealCategory;
												if (to) void move(dish, category, to);
												event.currentTarget.value = '';
											}}
											><option value="">Flytt til …</option
											>{#each mealCategories.filter((candidate) => !dish.active.categories.includes(candidate)) as candidate (candidate)}<option
													value={candidate}>{labels[candidate]}</option
												>{/each}</select
										><button
											class="btn btn-square btn-ghost btn-sm"
											type="button"
											disabled={index === 0}
											onclick={() => reorder(dish, category, -1)}
											aria-label={`Flytt ${dish.archive.name} opp i ${labels[category].toLocaleLowerCase('nb-NO')}`}
											><ArrowUp size={17} /></button
										><button
											class="btn btn-square btn-ghost btn-sm"
											type="button"
											disabled={index === categoryDishes.length - 1}
											onclick={() => reorder(dish, category, 1)}
											aria-label={`Flytt ${dish.archive.name} ned i ${labels[category].toLocaleLowerCase('nb-NO')}`}
											><ArrowDown size={17} /></button
										><button
											class="btn btn-square btn-ghost btn-sm"
											type="button"
											onclick={() =>
												(editing = {
													archive: latestArchiveById.get(dish.archive.id) ?? dish.archive,
													active: dish.active,
													entryId: dish.entryId,
													activateOnSave: true,
													initial: editorFor(
														latestArchiveById.get(dish.archive.id) ?? dish.archive,
														dish.active
													)
												})}
											aria-label={`Rediger ${dish.archive.name}`}><Edit3 size={17} /></button
										><button
											class="btn btn-square btn-sm btn-success"
											type="button"
											onclick={() => consume(dish, category)}
											aria-label={`Marker ${dish.archive.name} som spist til ${labels[category].toLocaleLowerCase('nb-NO')}`}
											><Check size={17} /></button
										>
									</div>
								</div>
							</article>
						{/each}
						{#if !categoryDishes.length}<p
								class="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/55"
							>
								Ingen retter til {labels[category].toLocaleLowerCase('nb-NO')}.
							</p>{/if}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<label class="input-bordered input mb-4 flex w-full items-center gap-2"
			><Search class="shrink-0" size={18} /><input
				class="min-w-0 grow"
				bind:value={query}
				placeholder="Søk i arkivet"
				aria-label="Søk i arkivet"
			/></label
		>
		<div class="mb-2 flex items-center justify-between gap-3 text-sm text-base-content/55">
			<p>{filteredArchives.length} {filteredArchives.length === 1 ? 'oppskrift' : 'oppskrifter'}</p>
			{#if query}<p class="truncate">Treff for «{query}»</p>{/if}
		</div>
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each filteredArchives as archive (archive.id)}
				{@const activeDish = dishById.get(archive.id)}
				{@const active = activeDish?.active}
				<article class="rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
					<div class="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3">
						<div
							class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-box bg-base-300 text-base-content/30"
						>
							{#if archive.imageUrl}<img
									class="h-full w-full object-cover"
									src={`/api/menu/image?url=${encodeURIComponent(archive.imageUrl)}`}
									alt=""
									loading="lazy"
									onerror={(event) => event.currentTarget.classList.add('hidden')}
								/>{:else}<Utensils size={25} />{/if}
						</div>
						<div class="min-w-0">
							{#if active}<span class="mb-1 badge badge-sm badge-primary">I menyen</span>{/if}
							<h2 class="font-display text-lg leading-tight font-bold">{archive.name}</h2>
							<div class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-base-content/65">
								<span>{archive.ingredients.length} ingredienser</span>
								<span>{archive.instructions.length} steg</span>
							</div>
							<p class="mt-1 text-sm text-base-content/55">
								{#if active}
									{active.plannedServings} porsjoner · {active.categories
										.map((category) => labels[category])
										.join(', ')}
								{:else}
									Standard {archive.defaultPlannedServings} porsjoner
								{/if}
							</p>
						</div>
					</div>
					<div class="mt-3 flex gap-2 border-t border-base-300 pt-3">
						<button
							class="btn min-h-10 flex-1 btn-primary btn-sm"
							type="button"
							onclick={() =>
								(recipe = {
									archive,
									plannedServings: active?.plannedServings ?? archive.defaultPlannedServings
								})}
							aria-label={`Vis oppskrift for ${archive.name}`}
							><BookOpen size={17} /> Se oppskrift</button
						>
						{#if !active}<button
								class="btn min-h-10 flex-1 btn-outline btn-sm"
								type="button"
								onclick={() => openActivation(archive)}><Plus size={17} /> Til meny</button
							>{/if}
						<details class="dropdown dropdown-end">
							<summary
								class="btn btn-square h-10 min-h-10 w-10 min-w-10 list-none btn-ghost btn-sm"
								aria-label={`Flere valg for ${archive.name}`}
								><EllipsisVertical size={19} /></summary
							>
							<ul
								class="menu dropdown-content z-30 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
							>
								<li>
									<button
										type="button"
										onclick={() =>
											(editing = {
												archive,
												active,
												entryId: activeDish?.entryId,
												activateOnSave: Boolean(active),
												initial: editorFor(archive, active)
											})}
										aria-label={`Rediger ${archive.name}`}><Edit3 size={17} /> Rediger</button
									>
								</li>
								<li>
									<button
										class="text-error"
										type="button"
										onclick={() => archiveRecipe(archive)}
										aria-label={`Arkiver ${archive.name}`}><Archive size={17} /> Arkiver</button
									>
								</li>
							</ul>
						</details>
					</div>
				</article>
			{/each}
			{#if !filteredArchives.length}<p
					class="rounded-box border border-dashed border-base-300 p-8 text-center text-sm text-base-content/55 sm:col-span-2 xl:col-span-3"
				>
					Ingen oppskrifter matcher søket.
				</p>{/if}
		</div>
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
