<script lang="ts">
	import { Check, ChevronDown, Search, X } from '@lucide/svelte';

	let {
		value = $bindable(),
		label = 'Tidssone',
		at = ''
	}: { value: string; label?: string; at?: string } = $props();

	let picker: HTMLDialogElement;
	let query = $state('');
	const timeZones = [...new Set([value, 'UTC', ...Intl.supportedValuesOf('timeZone')])].filter(
		Boolean
	);
	const referenceDate = $derived(
		/^\d{4}-\d{2}-\d{2}/.test(at) ? new Date(`${at.slice(0, 10)}T12:00:00Z`) : new Date()
	);
	const options = $derived(
		timeZones
			.map((timeZone) => ({
				timeZone,
				name: displayName(timeZone),
				offset: offsetLabel(timeZone, referenceDate)
			}))
			.sort((left, right) => left.name.localeCompare(right.name, 'nb-NO'))
	);
	const selected = $derived(
		options.find((option) => option.timeZone === value) ?? {
			timeZone: value,
			name: displayName(value),
			offset: offsetLabel(value, referenceDate)
		}
	);
	const filteredOptions = $derived.by(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase('nb-NO');
		if (!normalizedQuery) return options;
		return options.filter((option) =>
			`${option.name} ${option.timeZone} ${option.offset}`
				.toLocaleLowerCase('nb-NO')
				.includes(normalizedQuery)
		);
	});

	function displayName(timeZone: string): string {
		return timeZone
			.split('/')
			.reverse()
			.map((part) => part.replaceAll('_', ' '))
			.join(' · ');
	}

	function offsetLabel(timeZone: string, date: Date): string {
		try {
			return (
				new Intl.DateTimeFormat('en-GB', {
					timeZone,
					timeZoneName: 'shortOffset'
				})
					.formatToParts(date)
					.find((part) => part.type === 'timeZoneName')
					?.value.replace('GMT+0', 'GMT') ?? 'GMT'
			);
		} catch {
			return 'GMT';
		}
	}

	function openPicker(): void {
		query = '';
		picker.showModal();
	}

	function selectTimeZone(timeZone: string): void {
		value = timeZone;
		picker.close();
	}
</script>

<div class="block">
	<span class="mb-1 block text-sm font-semibold">{label}</span>
	<button
		class="btn w-full justify-between border-base-300 bg-base-100 font-normal btn-sm"
		type="button"
		onclick={openPicker}
		aria-label={`${label}: ${selected.offset} ${selected.name}`}
	>
		<span class="min-w-0 truncate"><strong>{selected.offset}</strong> · {selected.name}</span>
		<ChevronDown class="shrink-0" size={15} />
	</button>
</div>

<dialog bind:this={picker} class="modal modal-bottom sm:modal-middle" aria-label="Velg tidssone">
	<div class="modal-box max-w-lg rounded-t-2xl p-0 sm:rounded-box">
		<div class="flex items-center justify-between border-b border-base-300 p-4">
			<div>
				<p class="text-xs font-semibold tracking-wide text-primary uppercase">{label}</p>
				<h3 class="font-display text-xl font-bold">Velg tidssone</h3>
			</div>
			<button
				class="btn btn-square btn-ghost btn-sm"
				type="button"
				onclick={() => picker.close()}
				aria-label="Lukk tidssoner"><X size={18} /></button
			>
		</div>
		<div class="p-4 pb-2">
			<label class="input flex w-full items-center gap-2 input-sm">
				<Search size={15} />
				<input
					bind:value={query}
					aria-label="Søk etter tidssone"
					placeholder="Søk etter by eller GMT+…"
				/>
			</label>
			<p class="mt-2 text-xs text-base-content/50">
				GMT-forskyvningen gjelder datoen i planen og følger sommertid automatisk.
			</p>
		</div>
		<div class="max-h-[55dvh] overflow-y-auto p-2 pt-1">
			{#each filteredOptions as option (option.timeZone)}
				<button
					class={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-base-200 ${option.timeZone === value ? 'bg-primary/10' : ''}`}
					type="button"
					onclick={() => selectTimeZone(option.timeZone)}
				>
					<span class="w-[5.5rem] shrink-0 text-xs font-bold whitespace-nowrap tabular-nums"
						>{option.offset}</span
					>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-semibold">{option.name}</span>
						<span class="block truncate text-xs text-base-content/45">{option.timeZone}</span>
					</span>
					{#if option.timeZone === value}<Check class="shrink-0 text-primary" size={17} />{/if}
				</button>
			{/each}
			{#if filteredOptions.length === 0}
				<p class="px-3 py-8 text-center text-sm text-base-content/55">Ingen tidssoner funnet.</p>
			{/if}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk tidssoner">Lukk</button>
	</form>
</dialog>
