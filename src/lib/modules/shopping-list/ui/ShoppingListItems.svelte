<script lang="ts">
	import {
		Check,
		Ellipsis,
		LoaderCircle,
		Search,
		ShoppingBasket,
		Undo2,
		WifiOff,
		X
	} from '@lucide/svelte';

	import type {
		ShoppingListItem,
		ShoppingListSnapshot
	} from '$lib/modules/shopping-list/domain/shopping-list';

	let {
		loading,
		snapshot,
		query = $bindable(),
		filteredItems,
		recentItems,
		writeAvailable,
		canMutate,
		busyItem,
		oncomplete,
		onedit,
		onrestore
	}: {
		loading: boolean;
		snapshot?: ShoppingListSnapshot;
		query: string;
		filteredItems: ShoppingListItem[];
		recentItems: ShoppingListItem[];
		writeAvailable: boolean;
		canMutate: boolean;
		busyItem: string;
		oncomplete: (item: ShoppingListItem) => void;
		onedit: (item: ShoppingListItem) => void;
		onrestore: (item: ShoppingListItem) => void;
	} = $props();
</script>

{#if loading && !snapshot}
	<div class="space-y-2.5" aria-label="Laster handlelisten">
		{#each [0, 1, 2, 3] as index (`skeleton-${index}`)}
			<div class="h-16 animate-pulse rounded-lg bg-base-300/60"></div>
		{/each}
	</div>
{:else if snapshot?.items.length}
	<label class="input mb-4 flex w-full items-center gap-2 bg-base-100">
		<Search size={18} />
		<input
			class="min-w-0 grow"
			type="search"
			placeholder="Søk i handlelisten"
			aria-label="Søk i handlelisten"
			bind:value={query}
		/>
		{#if query}
			<button
				class="btn btn-square btn-ghost btn-xs"
				type="button"
				onclick={() => (query = '')}
				aria-label="Tøm søket"
				title="Tøm søket"
			>
				<X size={16} />
			</button>
		{/if}
	</label>
	{#if filteredItems.length}
		<ul class="space-y-2" aria-label="Varer">
			{#each filteredItems as item (item.sourceName)}
				<li class="group relative">
					<button
						class="flex min-h-16 w-full cursor-pointer items-center rounded-lg border border-base-300/80 bg-base-100 py-3 pr-14 pl-4 text-left shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-success/35 hover:bg-success/8 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success active:translate-y-0 active:bg-success/15 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
						type="button"
						onclick={() => oncomplete(item)}
						disabled={!canMutate}
						aria-label={`Marker ${item.name} som kjøpt`}
					>
						<span class="min-w-0 flex-1">
							<span class="block leading-5 font-semibold">{item.name}</span>
							{#if item.specification}
								<span class="mt-0.5 block text-sm text-base-content/55">{item.specification}</span>
							{/if}
						</span>
					</button>
					<button
						class="btn absolute top-1/2 right-2 z-10 btn-circle -translate-y-1/2 cursor-pointer btn-ghost text-base-content/55 btn-sm hover:bg-base-300 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed"
						type="button"
						onclick={() => onedit(item)}
						disabled={!canMutate}
						aria-label={`Endre ${item.name}`}
						title={`Endre ${item.name}`}
					>
						{#if busyItem === item.sourceName}
							<LoaderCircle class="animate-spin" size={18} />
						{:else}
							<Ellipsis size={20} />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<div
			class="grid min-h-32 place-items-center border-y border-dashed border-base-300 py-8 text-center"
			aria-live="polite"
		>
			<p class="text-sm font-semibold text-base-content/55">Ingen varer matcher søket.</p>
		</div>
	{/if}
{:else if snapshot}
	<div
		class="grid min-h-52 place-items-center border-y border-dashed border-base-300 py-8 text-center"
	>
		<div>
			<ShoppingBasket class="mx-auto mb-3 text-primary" size={34} />
			<h2 class="font-display text-xl font-bold">Listen er tom</h2>
			<p class="mt-1 text-sm text-base-content/55">Legg til det dere trenger til turen.</p>
		</div>
	</div>
{:else if !writeAvailable}
	<div
		class="grid min-h-52 place-items-center border-y border-dashed border-base-300 py-8 text-center"
	>
		<div>
			<WifiOff class="mx-auto mb-3 text-base-content/45" size={34} />
			<h2 class="font-display text-xl font-bold">Ingen lagret handleliste</h2>
			<p class="mt-1 text-sm text-base-content/55">Åpne listen én gang når du har nett.</p>
		</div>
	</div>
{/if}

{#if recentItems.length}
	<section class="mt-10">
		<div class="mb-3 flex items-center justify-between gap-3 px-1">
			<h2 class="font-display text-xl font-bold">Nylig kjøpt</h2>
			<span
				class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums"
				>{recentItems.length}</span
			>
		</div>
		<ul class="space-y-2" aria-label="Nylig kjøpt">
			{#each recentItems as item (item.sourceName)}
				<li>
					<button
						class="group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-primary/15 bg-primary/8 px-4 py-2.5 text-left text-base-content/55 shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/30 hover:bg-primary/14 hover:text-base-content/75 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-0 active:bg-primary/18 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
						type="button"
						onclick={() => onrestore(item)}
						disabled={!canMutate}
						aria-label={`Legg ${item.name} tilbake på listen`}
						title={`Legg ${item.name} tilbake på listen`}
					>
						<Check class="shrink-0 text-success/70" size={17} />
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm line-through">{item.name}</span>
							{#if item.specification}<span class="block truncate text-xs"
									>{item.specification}</span
								>{/if}
						</span>
						<span
							class="flex min-w-6 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-base-content/35 transition-colors group-hover:text-primary"
						>
							{#if busyItem === item.sourceName}
								<LoaderCircle class="animate-spin" size={16} />
							{:else}
								<Undo2 size={16} />
								<span class="hidden sm:inline">Legg tilbake</span>
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}
