<script lang="ts">
	import { page } from '$app/state';
	import { tripDayState } from '$lib/trip/day.svelte';
	import DaySelector from '$lib/trip/DaySelector.svelte';
	import { tripDays } from '$lib/trip/itinerary';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import LogbookView from './LogbookView.svelte';

	const day = $derived(tripDays[tripDayState.selectedIndex] ?? tripDays[0]);
	const mapEnabled = $derived(page.data.enabledModuleIds?.includes('map') ?? true);
</script>

<svelte:head><title>Loggbok · Gjemmekontor</title></svelte:head>

<DaySelector />

<section class="mx-auto max-w-3xl px-4 py-5 pb-10">
	<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="text-sm font-semibold text-primary">{day.phase}</p>
			<h1 class="font-display mt-1 text-2xl font-bold text-neutral">Loggbok</h1>
		</div>
		<SyncStatus />
	</header>
	<LogbookView {day} {mapEnabled} />
</section>
