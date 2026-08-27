<script lang="ts">
	import { ArrowLeft, Plus, Settings } from '@lucide/svelte';

	import { resolve } from '$app/paths';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Administrer reiser · Gjemmekontor</title>
</svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-3xl px-5 py-10">
	<header class="mb-8 flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="mb-1 text-xs font-semibold tracking-wide text-primary uppercase">Administrator</p>
			<h1 class="font-display text-4xl font-bold text-neutral">Reiser</h1>
			<p class="mt-2 text-sm text-base-content/70">Opprett og konfigurer reisene i appen.</p>
		</div>
		<button class="btn btn-primary" type="button" disabled title="Kommer i neste trinn">
			<Plus size={18} /> Ny reise
		</button>
	</header>

	<section class="space-y-3" aria-label="Administrer reiser">
		{#each data.trips as trip (trip.id)}
			<div class="flex items-center gap-4 rounded-box border border-base-300 bg-base-100 p-4">
				<div class="min-w-0 grow">
					<h2 class="truncate text-lg font-bold">{trip.name}</h2>
					<p class="mt-1 text-sm text-base-content/65">
						{trip.setupRequired ? 'Oppsett må fullføres' : 'Klar for innlogging'}
					</p>
				</div>
				<button class="btn btn-outline btn-sm" type="button" disabled title="Kommer i neste trinn">
					<Settings size={17} /> Innstillinger
				</button>
			</div>
		{/each}
	</section>

	<a class="btn mt-6 btn-ghost" href={resolve('/trips')}
		><ArrowLeft size={17} /> Til reisevelgeren</a
	>
</main>
