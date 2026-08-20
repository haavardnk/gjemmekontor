<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	import { tripDayState } from './day.svelte';
	import { tripDays } from './days';

	function changeDay(event: Event): void {
		const select = event.currentTarget;
		if (select instanceof HTMLSelectElement) {
			void tripDayState.select(Number(select.value));
		}
	}
</script>

<div class="sticky top-14 z-30 border-b border-base-300 bg-base-100/95 px-3 py-2 backdrop-blur">
	<div class="mx-auto flex max-w-3xl items-center gap-2">
		<button
			class="btn btn-square shrink-0 btn-ghost btn-sm"
			type="button"
			disabled={tripDayState.selectedIndex === 0}
			onclick={() => tripDayState.select(tripDayState.selectedIndex - 1)}
			aria-label="Forrige dag"
			title="Forrige dag"
		>
			<ChevronLeft size={20} />
		</button>
		<label class="sr-only" for="trip-day">Velg dag</label>
		<select
			id="trip-day"
			class="select min-w-0 flex-1 bg-base-100 font-semibold select-sm"
			value={tripDayState.selectedIndex}
			onchange={changeDay}
		>
			{#each tripDays as day (day.date)}
				<option value={day.index}>{day.index + 1}. {day.dateLabel}</option>
			{/each}
		</select>
		<button
			class="btn btn-square shrink-0 btn-ghost btn-sm"
			type="button"
			disabled={tripDayState.selectedIndex === tripDays.length - 1}
			onclick={() => tripDayState.select(tripDayState.selectedIndex + 1)}
			aria-label="Neste dag"
			title="Neste dag"
		>
			<ChevronRight size={20} />
		</button>
		{#if tripDayState.showTodayOffer}
			<button
				class="btn shrink-0 btn-primary btn-sm"
				type="button"
				onclick={() => tripDayState.goToToday()}
			>
				Gå til i dag
			</button>
		{/if}
	</div>
</div>
