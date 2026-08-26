<script lang="ts">
	import { Camera, Film } from '@lucide/svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tripDayState } from '$lib/trip/day.svelte';
	import DaySelector from '$lib/trip/DaySelector.svelte';
	import { tripDays } from '$lib/trip/itinerary';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import { withShotsDayPlan } from '../domain/day-plan';
	import ShotsDigest from './ShotsDigest.svelte';
	import ShotsRecord from './ShotsRecord.svelte';

	const mode = $derived(page.url.searchParams.get('mode') === 'digest' ? 'digest' : 'record');
	const tripDay = $derived(tripDays[tripDayState.selectedIndex] ?? tripDays[0]);
	const day = $derived(withShotsDayPlan(tripDay));
</script>

<svelte:head><title>Opptak · Gjemmekontor</title></svelte:head>

<DaySelector />

<section class="mx-auto max-w-3xl px-4 py-5 pb-10 lg:py-7">
	<header class="mb-4">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="min-w-0 truncate text-sm font-semibold text-primary">{day.phase}</p>
			<SyncStatus />
		</div>
		<h1 class="font-display mt-1 text-2xl leading-tight font-bold text-neutral">{day.title}</h1>
		<div class="tabs tabs-box mt-3 h-9 w-full p-0.5" role="tablist" aria-label="Opptaksmodus">
			<a
				class="tab h-8 flex-1 gap-1.5 text-sm"
				class:tab-active={mode === 'record'}
				role="tab"
				aria-selected={mode === 'record'}
				href={resolve('/shots?mode=record')}
			>
				<Film size={15} />
				Opptak
			</a>
			<a
				class="tab h-8 flex-1 gap-1.5 text-sm"
				class:tab-active={mode === 'digest'}
				role="tab"
				aria-selected={mode === 'digest'}
				href={resolve('/shots?mode=digest')}
			>
				<Camera size={15} />
				Utvalg
			</a>
		</div>
	</header>

	{#if mode === 'record'}
		<ShotsRecord {day} />
	{:else}
		<ShotsDigest {day} />
	{/if}
</section>
