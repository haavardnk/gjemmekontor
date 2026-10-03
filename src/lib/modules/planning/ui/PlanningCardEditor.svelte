<script lang="ts">
	import { ImagePlus, Link2, Plus, Trash2, X } from '@lucide/svelte';
	import { onDestroy, untrack } from 'svelte';

	import { PlaceInput, type PlaceSelection } from '$lib/modules/map/public';

	import { pastedImages, type PlanningPhotoUpload, preparePlanningPhoto } from '../client/photos';
	import { type PlanningCardDraft, planningLinkInputSchema } from '../domain/inputs';
	import {
		type PlanningCard,
		type PlanningCategory,
		planningLimits,
		planningLinkHost,
		planningPhotoPath
	} from '../domain/planning';
	import type { PlanningPhotoChanges } from './planning-commands';
	import PlanningImage from './PlanningImage.svelte';

	let {
		card,
		categories,
		defaultCategoryId,
		initialPhotos = [],
		personId,
		googlePlacesApiKey,
		online,
		saving,
		errorMessage,
		onsave,
		onclose
	}: {
		card?: PlanningCard;
		categories: PlanningCategory[];
		defaultCategoryId: string | null;
		initialPhotos?: readonly File[];
		personId: string;
		googlePlacesApiKey: string;
		online: boolean;
		saving: boolean;
		errorMessage: string;
		onsave: (
			cardId: string,
			draft: PlanningCardDraft,
			photos: PlanningPhotoChanges
		) => Promise<void>;
		onclose: () => void;
	} = $props();

	const seed = untrack(() => ({
		card: $state.snapshot(card),
		categoryId: defaultCategoryId,
		photos: initialPhotos
	}));
	const cardId = seed.card?.id ?? crypto.randomUUID();
	let title = $state(seed.card?.title ?? '');
	let body = $state(seed.card?.body ?? '');
	let categoryId = $state(seed.card ? (seed.card.categoryId ?? '') : (seed.categoryId ?? ''));
	let placeLabel = $state(seed.card?.place?.label ?? '');
	let selectedPlace = $state<PlaceSelection | null>(
		seed.card?.place && seed.card.place.lat !== null && seed.card.place.lng !== null
			? {
					label: seed.card.place.label,
					lat: seed.card.place.lat,
					lng: seed.card.place.lng,
					placeId: seed.card.place.googlePlaceId ?? ''
				}
			: null
	);
	let checklist = $state(
		(seed.card?.checklist ?? []).map(({ id, text, checked }) => ({ id, text, checked }))
	);
	let newItemText = $state('');
	let links = $state((seed.card?.links ?? []).map(({ id, url }) => ({ id, url })));
	let newLinkUrl = $state('');
	let linkError = $state('');
	let photos = $state.raw<{ id: string; src: string; upload?: PlanningPhotoUpload }[]>(
		(seed.card?.photos ?? []).map(({ id }) => ({ id, src: planningPhotoPath(id, 'thumb') }))
	);
	let processingPhotos = $state(0);
	let photoError = $state('');
	let destroyed = false;

	void addPhotos(seed.photos);

	onDestroy(() => {
		destroyed = true;
		for (const photo of photos) if (photo.upload) URL.revokeObjectURL(photo.src);
	});

	async function addPhotos(files: readonly File[]): Promise<void> {
		if (!files.length) return;
		const room = planningLimits.photos - photos.length - processingPhotos;
		const accepted = files.slice(0, Math.max(0, room));
		photoError =
			accepted.length < files.length ? `Maks ${planningLimits.photos} bilder per kort.` : '';
		processingPhotos += accepted.length;
		for (const file of accepted) {
			try {
				const upload = await preparePlanningPhoto(file);
				if (destroyed) return;
				photos = [...photos, { id: upload.id, src: URL.createObjectURL(upload.thumb), upload }];
			} catch {
				photoError = 'Kunne ikke lese bildet.';
			} finally {
				processingPhotos -= 1;
			}
		}
	}

	function removePhoto(photoId: string): void {
		const photo = photos.find(({ id }) => id === photoId);
		if (photo?.upload) URL.revokeObjectURL(photo.src);
		photos = photos.filter(({ id }) => id !== photoId);
		photoError = '';
	}

	function parseLink(value: string): string | undefined {
		const text = value.trim();
		if (!text) return undefined;
		const parsed = planningLinkInputSchema.shape.url.safeParse(
			/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
		);
		return parsed.success ? parsed.data : undefined;
	}

	function addLink(): boolean {
		if (!newLinkUrl.trim()) return true;
		const url = parseLink(newLinkUrl);
		if (!url) {
			linkError = 'Lenken må være en nettadresse.';
			return false;
		}
		linkError = '';
		if (!links.some((link) => link.url === url) && links.length < planningLimits.links) {
			links = [...links, { id: crypto.randomUUID(), url }];
		}
		newLinkUrl = '';
		return true;
	}

	function addItem(): void {
		const text = newItemText.trim();
		if (!text || checklist.length >= planningLimits.checklistItems) return;
		checklist = [...checklist, { id: crypto.randomUUID(), text, checked: false }];
		newItemText = '';
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!addLink()) return;
		const label = placeLabel.trim();
		const place = label
			? selectedPlace?.label === placeLabel
				? {
						label,
						lat: selectedPlace.lat,
						lng: selectedPlace.lng,
						googlePlaceId: selectedPlace.placeId || null
					}
				: { label, lat: null, lng: null, googlePlaceId: null }
			: null;
		await onsave(
			cardId,
			{
				personId,
				categoryId: categoryId || null,
				title,
				body,
				place,
				checklist: checklist.filter((item) => item.text.trim()),
				links
			},
			{
				added: photos.flatMap(({ upload }) => (upload ? [upload] : [])),
				removed: (seed.card?.photos ?? [])
					.map(({ id }) => id)
					.filter((photoId) => !photos.some(({ id }) => id === photoId))
			}
		);
	}
</script>

<div
	class="modal modal-open z-100 p-0 sm:p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="planning-card-editor-title"
>
	<form
		class="modal-box flex h-dvh max-h-dvh w-full max-w-2xl flex-col rounded-none p-0 sm:h-auto sm:max-h-[94dvh] sm:rounded-box"
		onsubmit={submit}
		onpaste={(event) => {
			const images = pastedImages(event);
			if (!images.length) return;
			event.preventDefault();
			void addPhotos(images);
		}}
	>
		<header
			class="shrink-0 border-b border-base-300 bg-base-100 px-4 pb-3 sm:px-6 sm:pt-5"
			style="padding-top: max(1rem, env(safe-area-inset-top));"
		>
			<div class="flex items-center justify-between gap-4">
				<h2 id="planning-card-editor-title" class="font-display text-2xl font-bold">
					{card ? 'Rediger kort' : 'Nytt kort'}
				</h2>
				<button
					class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
					type="button"
					disabled={saving}
					onclick={onclose}
					aria-label="Lukk skjemaet"><X size={21} /></button
				>
			</div>
		</header>

		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
			<label class="block">
				<span class="label-text mb-1 block font-semibold">Tittel</span>
				<input
					class="input-bordered input w-full"
					bind:value={title}
					maxlength={planningLimits.title}
					autocomplete="off"
					required
				/>
			</label>
			<label class="block">
				<span class="label-text mb-1 block font-semibold">Kategori</span>
				<select class="select-bordered select w-full" bind:value={categoryId}>
					<option value="">Usortert</option>
					{#each categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</label>
			<label class="block">
				<span class="label-text mb-1 block font-semibold">Notat</span>
				<textarea
					class="textarea-bordered textarea min-h-32 w-full"
					bind:value={body}
					maxlength={planningLimits.body}></textarea>
			</label>
			<PlaceInput
				label="Sted"
				bind:value={placeLabel}
				apiKey={googlePlacesApiKey}
				required={false}
				onselect={(place) => {
					selectedPlace = place;
				}}
			/>
			<fieldset class="space-y-2">
				<legend class="label-text mb-1 font-semibold">Sjekkliste</legend>
				{#each checklist as item, index (item.id)}
					<div class="flex items-center gap-2">
						<input
							class="checkbox checkbox-sm"
							type="checkbox"
							bind:checked={item.checked}
							aria-label={`Ferdig: ${item.text}`}
						/>
						<input
							class="input-bordered input min-w-0 flex-1 input-sm"
							bind:value={item.text}
							maxlength={planningLimits.checklistText}
							aria-label={`Punkt ${index + 1}`}
						/>
						<button
							class="btn btn-square btn-ghost btn-sm"
							type="button"
							onclick={() => {
								checklist = checklist.filter(({ id }) => id !== item.id);
							}}
							aria-label={`Fjern ${item.text}`}><Trash2 size={16} /></button
						>
					</div>
				{/each}
				<div class="flex items-center gap-2">
					<input
						class="input-bordered input min-w-0 flex-1 input-sm"
						bind:value={newItemText}
						maxlength={planningLimits.checklistText}
						placeholder="Nytt punkt"
						aria-label="Nytt punkt"
						onkeydown={(event) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							addItem();
						}}
					/>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						disabled={!newItemText.trim() || checklist.length >= planningLimits.checklistItems}
						onclick={addItem}
						aria-label="Legg til punkt"><Plus size={18} /></button
					>
				</div>
			</fieldset>
			<fieldset class="space-y-2">
				<legend class="label-text mb-1 font-semibold">Lenker</legend>
				{#each links as link (link.id)}
					<div class="flex items-center gap-2">
						<Link2 class="shrink-0 text-base-content/50" size={16} aria-hidden="true" />
						<span class="min-w-0 flex-1 truncate text-sm">{link.url}</span>
						<button
							class="btn btn-square btn-ghost btn-sm"
							type="button"
							onclick={() => {
								links = links.filter(({ id }) => id !== link.id);
							}}
							aria-label={`Fjern lenken ${planningLinkHost(link.url)}`}><Trash2 size={16} /></button
						>
					</div>
				{/each}
				{#if links.length < planningLimits.links}
					<div class="flex items-center gap-2">
						<input
							class="input-bordered input min-w-0 flex-1 input-sm"
							bind:value={newLinkUrl}
							maxlength={planningLimits.url}
							inputmode="url"
							autocomplete="off"
							placeholder="https://"
							aria-label="Ny lenke"
							aria-invalid={Boolean(linkError)}
							oninput={() => (linkError = '')}
							onkeydown={(event) => {
								if (event.key !== 'Enter') return;
								event.preventDefault();
								addLink();
							}}
						/>
						<button
							class="btn btn-square btn-ghost btn-sm"
							type="button"
							disabled={!newLinkUrl.trim()}
							onclick={addLink}
							aria-label="Legg til lenke"><Plus size={18} /></button
						>
					</div>
				{/if}
				{#if linkError}<p class="text-sm text-error" role="alert">{linkError}</p>{/if}
			</fieldset>
			<fieldset class="space-y-2">
				<legend class="label-text mb-1 font-semibold">Bilder</legend>
				{#if photos.length || processingPhotos}
					<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{#each photos as photo, index (photo.id)}
							<li class="relative">
								<PlanningImage
									src={photo.src}
									alt={`Bilde ${index + 1}`}
									class="aspect-square w-full rounded-field bg-base-200 object-cover"
								/>
								<button
									class="btn absolute top-1 right-1 btn-circle shadow-sm btn-xs"
									type="button"
									onclick={() => removePhoto(photo.id)}
									aria-label={`Fjern bilde ${index + 1}`}><X size={14} /></button
								>
							</li>
						{/each}
						{#each { length: processingPhotos }, index (index)}
							<li class="aspect-square skeleton rounded-field"></li>
						{/each}
					</ul>
				{/if}
				{#if photos.length + processingPhotos < planningLimits.photos}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<label class="btn btn-ghost btn-sm has-focus-visible:outline-2">
							<ImagePlus size={18} aria-hidden="true" />
							Legg til bilder
							<input
								class="sr-only"
								type="file"
								accept="image/*"
								multiple
								onchange={(event) => {
									const input = event.currentTarget;
									void addPhotos([...(input.files ?? [])]);
									input.value = '';
								}}
							/>
						</label>
						<span class="text-xs text-base-content/60">Du kan også lime inn bilder.</span>
					</div>
				{/if}
				{#if photoError}<p class="text-sm text-error" role="alert">{photoError}</p>{/if}
			</fieldset>
			{#if errorMessage}<p class="text-sm text-error" role="alert">{errorMessage}</p>{/if}
		</div>

		<footer
			class="flex shrink-0 justify-end gap-2 border-t border-base-300 bg-base-100 px-4 pt-3 sm:px-6 sm:pb-5"
			style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
		>
			<button class="btn btn-ghost" type="button" disabled={saving} onclick={onclose}>Avbryt</button
			>
			<button
				class="btn btn-primary"
				type="submit"
				disabled={!online || saving || processingPhotos > 0 || !title.trim()}>Lagre</button
			>
		</footer>
	</form>
</div>
