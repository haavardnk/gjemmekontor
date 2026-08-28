<script lang="ts">
	import { CalendarDays, ChevronRight, LockKeyhole, Settings } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { discardPreTripClientStorage } from '$lib/client/storage-generation';
	import BrandLogo from '$lib/ui/BrandLogo.svelte';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		void discardPreTripClientStorage();
	});

	function dates(startsOn?: string, endsOn?: string): string {
		if (!startsOn && !endsOn) return 'Datoer er ikke satt';
		return [startsOn, endsOn].filter(Boolean).join(' – ');
	}
</script>

<svelte:head>
	<title>Velg reise · Gjemmekontor</title>
</svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10 sm:py-16">
	<ThemeToggle class="fixed top-4 right-4" />
	<header class="mb-9 text-center">
		<BrandLogo class="mx-auto mb-5 size-28 text-primary" />
		<p class="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">Gjemmekontor</p>
		<h1 class="font-display text-4xl font-bold text-neutral">Velg reise</h1>
		<p class="mt-3 text-sm text-base-content/70">Velg reisen du vil åpne.</p>
	</header>

	<section class="space-y-3" aria-label="Reiser">
		{#each data.trips as trip (trip.id)}
			<a
				class="group flex items-center gap-4 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
				href={resolve('/t/[tripSlug]/unlock', { tripSlug: trip.slug })}
			>
				<div
					class="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
				>
					{#if trip.setupRequired}<Settings size={21} />{:else}<LockKeyhole size={21} />{/if}
				</div>
				<div class="min-w-0 grow">
					<h2 class="truncate text-lg font-bold text-neutral">{trip.name}</h2>
					<p class="mt-1 flex items-center gap-1.5 text-sm text-base-content/65">
						<CalendarDays size={15} />
						{dates(trip.startsOn, trip.endsOn)}
					</p>
					{#if trip.setupRequired}
						<p class="mt-2 text-sm font-semibold text-warning">Krever administratoroppsett</p>
					{/if}
				</div>
				<ChevronRight class="shrink-0 text-base-content/40 group-hover:text-primary" size={22} />
			</a>
		{:else}
			<div class="rounded-box border border-dashed border-base-300 p-8 text-center">
				<p class="font-semibold">Ingen reiser er tilgjengelige.</p>
			</div>
		{/each}
	</section>

	<div class="mt-8 text-center">
		{#if data.adminAuthenticated}
			<a class="btn btn-outline btn-sm" href={resolve('/admin/trips')}>
				<Settings size={17} /> Administrer reiser
			</a>
		{:else}
			<a class="link text-sm text-base-content/65" href={resolve('/admin/login')}>Administrator</a>
		{/if}
	</div>
</main>
