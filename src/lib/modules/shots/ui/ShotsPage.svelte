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

<section class="mx-auto max-w-3xl px-4 py-3 pb-8">
	<header class="mb-4 space-y-2">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="text-xs font-semibold text-primary">{day.phase}</p>
				<h1 class="font-display text-xl leading-tight font-bold text-neutral">{day.title}</h1>
			</div>
			<SyncStatus />
		</div>
		<div class="tabs tabs-box h-9 w-full p-0.5" role="tablist" aria-label="Opptaksmodus">
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
