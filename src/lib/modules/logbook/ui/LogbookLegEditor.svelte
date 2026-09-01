<script lang="ts">
	import { FileCheck2, FileUp, RefreshCw } from '@lucide/svelte';

	import { mooringChoices } from '../domain/logbook';
	import LocationInput from './LocationInput.svelte';
	import type { LogbookLegDraft } from './logbook-leg-draft';

	let {
		draft,
		locationSuggestions,
		dateMismatch,
		canSave,
		formatTime,
		formatDuration,
		onimport,
		onsave,
		onclose
	}: {
		draft: LogbookLegDraft;
		locationSuggestions: { id: string; name: string }[];
		dateMismatch: boolean;
		canSave: boolean;
		formatTime: (value: string) => string;
		formatDuration: (seconds: number) => string;
		onimport: (event: Event) => void;
		onsave: () => void;
		onclose: () => void;
	} = $props();

	let fileInput: HTMLInputElement | undefined;
</script>

<div class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="add-leg-title">
	<div class="modal-box max-w-xl">
		<h2 id="add-leg-title" class="font-display text-2xl font-bold">
			{draft.editingKey ? 'Rediger etappe' : 'Ny etappe'}
		</h2>
		<input
			class="hidden"
			type="file"
			accept=".gpx,application/gpx+xml"
			bind:this={fileInput}
			onchange={onimport}
		/>
		<section class="mt-4 rounded-lg border border-base-300 bg-base-200 p-4">
			{#if draft.gpx}
				<div class="flex items-start gap-3">
					<FileCheck2 class="mt-0.5 shrink-0 text-success" size={21} />
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold">{draft.gpx.filename}</p>
						<p class="mt-1 text-sm text-base-content/65">
							{formatTime(draft.gpx.departureAt)}–{formatTime(draft.gpx.arrivalAt)} · {draft.gpx.nauticalMiles.toLocaleString(
								'nb-NO',
								{ maximumFractionDigits: 1 }
							)} nm
						</p>
						<p class="mt-1 text-xs text-base-content/55">
							Aktiv {formatDuration(draft.gpx.activeSeconds)} · Totalt {formatDuration(
								draft.gpx.elapsedSeconds
							)} · {formatDuration(draft.gpx.stationarySeconds)} uten bevegelse fjernet
						</p>
					</div>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						disabled={draft.readingGpx}
						onclick={() => fileInput?.click()}
						aria-label="Bytt GPX-fil"
						title="Bytt GPX-fil"><RefreshCw size={17} /></button
					>
				</div>
				{#if dateMismatch}
					<p class="mt-3 text-sm text-warning" role="alert">
						Datoen i GPX-filen er en annen enn valgt dag. Kontroller at etappen ligger riktig.
					</p>
				{/if}
			{:else}
				<div class="text-center">
					<FileUp class="mx-auto text-primary" size={28} />
					<p class="mt-2 font-semibold">Legg til GPX fra Orca</p>
					<p class="mt-1 text-sm text-base-content/60">
						Etappen, tidene og distansen hentes fra filen.
					</p>
					<button
						class="btn mt-3 btn-primary btn-sm"
						type="button"
						disabled={draft.readingGpx}
						onclick={() => fileInput?.click()}
					>
						<FileUp size={16} />{draft.readingGpx ? 'Leser GPX …' : 'Velg GPX-fil'}
					</button>
				</div>
			{/if}
		</section>
		{#if draft.gpx || draft.editingKey}
			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				<LocationInput label="Fra" bind:value={draft.from} suggestions={locationSuggestions} />
				<LocationInput label="Til" bind:value={draft.to} suggestions={locationSuggestions} />
				<label class="block"
					><span class="mb-1 block font-semibold">Avgang</span><input
						class="input w-full"
						type="time"
						readonly={draft.gpx !== undefined}
						bind:value={draft.departure}
					/></label
				>
				<label class="block"
					><span class="mb-1 block font-semibold">Ankomst</span><input
						class="input w-full"
						type="time"
						readonly={draft.gpx !== undefined}
						bind:value={draft.arrival}
					/></label
				>
				<label class="block"
					><span class="mb-1 block font-semibold">Nautiske mil</span><input
						class="input w-full"
						type="number"
						min="0"
						max="500"
						step="0.1"
						readonly={draft.gpx !== undefined}
						bind:value={draft.nauticalMiles}
					/></label
				>
				<label class="block">
					<span class="mb-1 block font-semibold">Fortøyning</span>
					<select class="select w-full" bind:value={draft.mooring}
						>{#each mooringChoices as choice (choice.value)}<option value={choice.value}
								>{choice.label}</option
							>{/each}</select
					>
				</label>
				<label class="block"
					><span class="mb-1 block font-semibold">Seiling, minutter</span><input
						class="input w-full"
						type="number"
						min="0"
						max="1440"
						bind:value={draft.sailingMinutes}
					/></label
				>
				<label class="block"
					><span class="mb-1 block font-semibold">Motor, minutter</span><input
						class="input w-full"
						type="number"
						min="0"
						max="1440"
						bind:value={draft.engineMinutes}
					/></label
				>
				{#if draft.mooring === 'other'}<label class="block sm:col-span-2"
						><span class="mb-1 block font-semibold">Fortøyningstype</span><input
							class="input w-full"
							bind:value={draft.customMooring}
							maxlength="100"
						/></label
					>{/if}
			</div>
		{/if}
		{#if draft.error}<p class="mt-3 text-sm text-error" role="alert">{draft.error}</p>{/if}
		<div class="modal-action">
			<button class="btn" type="button" onclick={onclose}>Avbryt</button>
			<button class="btn btn-primary" type="button" disabled={!canSave} onclick={onsave}>
				{draft.editingKey ? 'Lagre endringer' : 'Lagre etappe'}
			</button>
		</div>
	</div>
	<button class="modal-backdrop" type="button" onclick={onclose} aria-label="Lukk"></button>
</div>
