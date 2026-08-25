<script lang="ts">
	import { CirclePlus, Film, Trash2 } from '@lucide/svelte';

	import { sharedState } from '$lib/client/state.svelte';
	import type { TripDay } from '$lib/trip/itinerary';

	import { backupChecks } from '../domain/content';
	import {
		cameraChoices,
		mediaKey,
		type MediaRow,
		mediaRows,
		offloadCameraChoices,
		serializeMediaRow
	} from '../domain/digest';

	let { day }: { day: TripDay } = $props();

	let adding = $state(false);
	let description = $state('');
	let camera = $state<(typeof cameraChoices)[number]>('Pocket 4');
	let customCamera = $state('');
	let filename = $state('');

	const videoRows = $derived(mediaRows(sharedState.values, day.index));

	function fieldKey(field: string): string {
		return `shots:d${day.index}:${field}`;
	}

	function checked(key: string): boolean {
		return sharedState.values[key] === true;
	}

	function toggle(key: string): void {
		void sharedState.set(key, !checked(key));
	}

	function textValue(key: string): string {
		const value = sharedState.values[key];
		return typeof value === 'string' ? value : '';
	}

	function saveText(key: string, event: Event): void {
		const input = event.currentTarget;
		if (input instanceof HTMLTextAreaElement) {
			void sharedState.set(key, input.value.trim());
		}
	}

	function openAdd(): void {
		adding = true;
		description = '';
		camera = 'Pocket 4';
		customCamera = '';
		filename = '';
	}

	async function addMedia(): Promise<void> {
		if (!description.trim()) {
			return;
		}
		const id = crypto.randomUUID();
		const row: MediaRow = {
			description: description.trim(),
			camera,
			customCamera: camera === 'Annet' ? customCamera.trim() : '',
			filename: filename.trim(),
			createdAt: new Date().toISOString(),
			createdBy: await sharedState.clientId(),
			tombstone: false
		};
		await sharedState.set(mediaKey(day.index, id), serializeMediaRow(row));
		adding = false;
	}

	function deleteMedia(key: string, row: MediaRow): void {
		void sharedState.set(key, serializeMediaRow({ ...row, tombstone: true }));
	}
</script>

<div class="space-y-7">
	<div class="grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="mb-2 font-bold">Dagens historie</span>
			<textarea
				class="textarea min-h-28 w-full bg-base-100"
				placeholder="Hva handler dagen om?"
				value={textValue(`digest:d${day.index}:story`)}
				onchange={(event) => saveText(`digest:d${day.index}:story`, event)}></textarea>
		</label>
		<label class="block">
			<span class="mb-2 font-bold">Det som mangler</span>
			<textarea
				class="textarea min-h-28 w-full bg-base-100"
				placeholder="Hva skulle dere gjerne hatt?"
				value={textValue(`digest:d${day.index}:missing`)}
				onchange={(event) => saveText(`digest:d${day.index}:missing`, event)}></textarea>
		</label>
	</div>

	<section>
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="font-display flex items-center gap-2 text-xl font-bold">
				<Film size={21} />
				Viktige videoklipp
			</h2>
			<button
				class="btn btn-primary btn-sm"
				type="button"
				disabled={!sharedState.ready}
				onclick={openAdd}
			>
				<CirclePlus size={17} />
				Legg til
			</button>
		</div>
		<div class="space-y-2">
			{#each videoRows as row (row.key)}
				<article class="flex items-start gap-3 rounded-lg border border-base-300 bg-base-100 p-3">
					<div class="min-w-0 flex-1">
						<p class="font-semibold">{row.description}</p>
						<p class="mt-1 text-sm text-base-content/60">
							{row.camera === 'Annet' ? row.customCamera : row.camera}
							{#if row.filename}
								· {row.filename}{/if}
						</p>
					</div>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						onclick={() => deleteMedia(row.key, row)}
						aria-label="Slett rad"
						title="Slett rad"
					>
						<Trash2 size={17} />
					</button>
				</article>
			{:else}
				<p
					class="rounded-lg border border-dashed border-base-300 p-5 text-center text-sm text-base-content/55"
				>
					Ingen registrerte ennå.
				</p>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="font-display mb-3 text-xl font-bold">Kontroll før kvelden</h2>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="rounded-lg border border-base-300 bg-base-100 p-3">
				<h3 class="mb-2 font-bold">Backup</h3>
				<div class="space-y-1">
					{#each backupChecks as item, index (item)}
						<label
							class="flex cursor-pointer items-start gap-2 rounded p-2 text-sm hover:bg-base-200"
						>
							<input
								class="checkbox mt-0.5 checkbox-sm"
								type="checkbox"
								disabled={!sharedState.ready}
								checked={checked(fieldKey(`backup:${index}`))}
								onchange={() => toggle(fieldKey(`backup:${index}`))}
							/>
							<span>{item}</span>
						</label>
					{/each}
				</div>
			</div>
			<div class="rounded-lg border border-base-300 bg-base-100 p-3">
				<h3 class="mb-2 font-bold">Kameraer tømt</h3>
				<div class="grid gap-1 sm:grid-cols-2">
					{#each offloadCameraChoices as choice, index (choice)}
						<label
							class="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-base-200"
						>
							<input
								class="checkbox checkbox-sm"
								type="checkbox"
								disabled={!sharedState.ready}
								checked={checked(fieldKey(`offload:${index}`))}
								onchange={() => toggle(fieldKey(`offload:${index}`))}
							/>
							<span>{choice}</span>
						</label>
					{/each}
				</div>
			</div>
		</div>
	</section>
</div>

{#if adding}
	<div class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="add-media-title">
		<div class="modal-box w-[calc(100%-2rem)] max-w-lg">
			<h2 id="add-media-title" class="font-display text-2xl font-bold">Legg til videoklipp</h2>
			<div class="mt-4 space-y-4">
				<label class="block">
					<span class="mb-1 block font-semibold">Beskrivelse</span>
					<textarea class="textarea min-h-24 w-full" bind:value={description} maxlength="500"
					></textarea>
				</label>
				<label class="block">
					<span class="mb-1 block font-semibold">Kamera</span>
					<select class="select w-full" bind:value={camera}>
						{#each cameraChoices as choice (choice)}
							<option value={choice}>{choice}</option>
						{/each}
					</select>
				</label>
				{#if camera === 'Annet'}
					<label class="block">
						<span class="mb-1 block font-semibold">Kameranavn</span>
						<input class="input w-full" bind:value={customCamera} maxlength="100" />
					</label>
				{/if}
				<label class="block">
					<span class="mb-1 block font-semibold">
						Filnavn <span class="font-normal text-base-content/50">(valgfritt)</span>
					</span>
					<input class="input w-full" bind:value={filename} maxlength="200" />
				</label>
			</div>
			<div class="modal-action">
				<button class="btn" type="button" onclick={() => (adding = false)}>Avbryt</button>
				<button
					class="btn btn-primary"
					type="button"
					disabled={!description.trim() || (camera === 'Annet' && !customCamera.trim())}
					onclick={addMedia}
				>
					Lagre
				</button>
			</div>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (adding = false)} aria-label="Lukk"
		></button>
	</div>
{/if}
