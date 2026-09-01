<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		BookOpen,
		Check,
		Edit3,
		ShoppingBasket,
		Utensils
	} from '@lucide/svelte';

	import {
		mealCategories,
		type MealCategory,
		orderedDishesInCategory,
		type TripMenuDish
	} from '../domain/menu';
	import { mealCategoryLabels as labels } from './menu-labels';

	let {
		dishes,
		mobileCategory = $bindable(),
		onshopping,
		onrecipe,
		onmove,
		onreorder,
		onedit,
		onconsume,
		onuseLatest
	}: {
		dishes: TripMenuDish[];
		mobileCategory: MealCategory;
		onshopping: (scope: 'dish' | 'menu', dishes: TripMenuDish[]) => void;
		onrecipe: (dish: TripMenuDish) => void;
		onmove: (dish: TripMenuDish, from: MealCategory, to: MealCategory) => void;
		onreorder: (dish: TripMenuDish, category: MealCategory, offset: -1 | 1) => void;
		onedit: (dish: TripMenuDish) => void;
		onconsume: (dish: TripMenuDish, category: MealCategory) => void;
		onuseLatest: (dish: TripMenuDish) => void;
	} = $props();
</script>

<div class="mb-3 flex sm:justify-end">
	<button
		class="btn min-h-10 w-full btn-outline leading-tight btn-sm sm:w-auto"
		type="button"
		disabled={!dishes.length}
		onclick={() => onshopping('menu', [...dishes])}
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
					<article class="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
						<div class="relative h-28 bg-base-300">
							<div class="absolute inset-0 flex items-center justify-center text-base-content/30">
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
										class="badge shrink-0 badge-sm whitespace-nowrap badge-success">Lagt til</span
									>{/if}
								{#if dish.archive.recipeVersion < dish.latestRecipeVersion}<button
										class="badge shrink-0 badge-sm badge-warning"
										type="button"
										onclick={() => onuseLatest(dish)}
										aria-label={`Bruk nyeste versjon av ${dish.archive.name}`}>Ny versjon</button
									>{/if}
							</div>
							<div class="mb-3 flex flex-wrap gap-1">
								{#each dish.active.categories as selected (selected)}<span
										class="badge badge-outline badge-sm">{labels[selected]}</span
									>{/each}
							</div>
							<div class="mb-2 grid grid-cols-2 gap-2">
								<button class="btn btn-outline btn-sm" type="button" onclick={() => onrecipe(dish)}
									><BookOpen size={16} /> Oppskrift</button
								>
								<button
									class="btn btn-outline btn-sm"
									type="button"
									onclick={() => onshopping('dish', [dish])}
									><ShoppingBasket size={16} />{dish.active.shoppingStatus
										? 'Legg til igjen'
										: 'Handleliste'}</button
								>
							</div>
							<div class="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] gap-1.5">
								<select
									class="select-bordered select select-sm"
									aria-label={`Flytt ${dish.archive.name}`}
									onchange={(event) => {
										const to = event.currentTarget.value as MealCategory;
										if (to) onmove(dish, category, to);
										event.currentTarget.value = '';
									}}
								>
									<option value="">Flytt til …</option>
									{#each mealCategories.filter((candidate) => !dish.active.categories.includes(candidate)) as candidate (candidate)}<option
											value={candidate}>{labels[candidate]}</option
										>{/each}
								</select>
								<button
									class="btn btn-square btn-ghost btn-sm"
									type="button"
									disabled={index === 0}
									onclick={() => onreorder(dish, category, -1)}
									aria-label={`Flytt ${dish.archive.name} opp i ${labels[category].toLocaleLowerCase('nb-NO')}`}
									><ArrowUp size={17} /></button
								>
								<button
									class="btn btn-square btn-ghost btn-sm"
									type="button"
									disabled={index === categoryDishes.length - 1}
									onclick={() => onreorder(dish, category, 1)}
									aria-label={`Flytt ${dish.archive.name} ned i ${labels[category].toLocaleLowerCase('nb-NO')}`}
									><ArrowDown size={17} /></button
								>
								<button
									class="btn btn-square btn-ghost btn-sm"
									type="button"
									onclick={() => onedit(dish)}
									aria-label={`Rediger ${dish.archive.name}`}><Edit3 size={17} /></button
								>
								<button
									class="btn btn-square btn-sm btn-success"
									type="button"
									onclick={() => onconsume(dish, category)}
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
