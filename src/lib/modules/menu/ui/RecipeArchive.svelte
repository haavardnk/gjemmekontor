<script lang="ts">
	import {
		Archive,
		BookOpen,
		Edit3,
		EllipsisVertical,
		Plus,
		Search,
		Utensils
	} from '@lucide/svelte';

	import type { RecipeArchiveView, TripMenuDish } from '../domain/menu';
	import { mealCategoryLabels as labels } from './menu-labels';

	let {
		archives,
		dishById,
		query = $bindable(),
		onrecipe,
		onactivate,
		onedit,
		onarchive
	}: {
		archives: RecipeArchiveView[];
		dishById: Map<string, TripMenuDish>;
		query: string;
		onrecipe: (archive: RecipeArchiveView, activeDish?: TripMenuDish) => void;
		onactivate: (archive: RecipeArchiveView) => void;
		onedit: (archive: RecipeArchiveView, activeDish?: TripMenuDish) => void;
		onarchive: (archive: RecipeArchiveView) => void;
	} = $props();
</script>

<label class="input-bordered input mb-4 flex w-full items-center gap-2">
	<Search class="shrink-0" size={18} />
	<input
		class="min-w-0 grow"
		bind:value={query}
		placeholder="Søk i arkivet"
		aria-label="Søk i arkivet"
	/>
</label>
<div class="mb-2 flex items-center justify-between gap-3 text-sm text-base-content/55">
	<p>{archives.length} {archives.length === 1 ? 'oppskrift' : 'oppskrifter'}</p>
	{#if query}<p class="truncate">Treff for «{query}»</p>{/if}
</div>
<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
	{#each archives as archive (archive.id)}
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
						<span>{archive.ingredients.length} ingredienser</span><span
							>{archive.instructions.length} steg</span
						>
					</div>
					<p class="mt-1 text-sm text-base-content/55">
						{#if active}{active.plannedServings} porsjoner · {active.categories
								.map((category) => labels[category])
								.join(', ')}{:else}Standard {archive.defaultPlannedServings} porsjoner{/if}
					</p>
				</div>
			</div>
			<div class="mt-3 flex gap-2 border-t border-base-300 pt-3">
				<button
					class="btn min-h-10 flex-1 btn-primary btn-sm"
					type="button"
					onclick={() => onrecipe(archive, activeDish)}
					aria-label={`Vis oppskrift for ${archive.name}`}
					><BookOpen size={17} /> Se oppskrift</button
				>
				{#if !active}<button
						class="btn min-h-10 flex-1 btn-outline btn-sm"
						type="button"
						onclick={() => onactivate(archive)}><Plus size={17} /> Til meny</button
					>{/if}
				<details class="dropdown dropdown-end">
					<summary
						class="btn btn-square h-10 min-h-10 w-10 min-w-10 list-none btn-ghost btn-sm"
						aria-label={`Flere valg for ${archive.name}`}><EllipsisVertical size={19} /></summary
					>
					<ul
						class="menu dropdown-content z-30 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
					>
						<li>
							<button
								type="button"
								onclick={() => onedit(archive, activeDish)}
								aria-label={`Rediger ${archive.name}`}><Edit3 size={17} /> Rediger</button
							>
						</li>
						<li>
							<button
								class="text-error"
								type="button"
								onclick={() => onarchive(archive)}
								aria-label={`Arkiver ${archive.name}`}><Archive size={17} /> Arkiver</button
							>
						</li>
					</ul>
				</details>
			</div>
		</article>
	{/each}
	{#if !archives.length}<p
			class="rounded-box border border-dashed border-base-300 p-8 text-center text-sm text-base-content/55 sm:col-span-2 xl:col-span-3"
		>
			Ingen oppskrifter matcher søket.
		</p>{/if}
</div>
