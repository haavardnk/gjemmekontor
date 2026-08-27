<script lang="ts">
	import { page } from '$app/state';
	import { tripDayState } from '$lib/trip/day.svelte';
	import DaySelector from '$lib/trip/DaySelector.svelte';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import LogbookView from './LogbookView.svelte';

	const days = $derived(page.data.tripDays ?? []);
	const day = $derived(days[tripDayState.selectedIndex] ?? days[0]);
	const mapEnabled = $derived(page.data.enabledModuleIds?.includes('map') ?? true);
</script>

<svelte:head><title>Loggbok · Gjemmekontor</title></svelte:head>

<DaySelector {days} />

<section class="mx-auto max-w-3xl px-4 py-5 pb-10 lg:py-7">
	<header class="mb-4">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="text-sm font-semibold text-primary">{day.phase}</p>
			<SyncStatus />
		</div>
		<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Loggbok</h1>
	</header>
	<LogbookView {day} {mapEnabled} />
</section>
