<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Google Maps links are built from a fixed HTTPS origin. */

	import { ArrowDown, ArrowUp, Edit3, MapPin, Trash2, X } from '@lucide/svelte';

	import LinkedText from '$lib/ui/LinkedText.svelte';

	import {
		checklistProgress,
		googleMapsPlaceUrl,
		type PlanningCard,
		type PlanningCategory,
		type PlanningPerson,
		planningPhotoPath
	} from '../domain/planning';
	import { planningColorStyles } from './planning-colors';
	import PlanningImage from './PlanningImage.svelte';
	import PlanningLinkPreview from './PlanningLinkPreview.svelte';
	import PlanningPhotoViewer from './PlanningPhotoViewer.svelte';

	let {
		card,
		categories,
		people,
		sectionIndex,
		sectionLength,
		canWrite,
		ontoggle,
		oncategory,
		onmove,
		onretry,
		onedit,
		ondelete,
		onclose
	}: {
		card: PlanningCard;
		categories: PlanningCategory[];
		people: PlanningPerson[];
		sectionIndex: number;
		sectionLength: number;
		canWrite: boolean;
		ontoggle: (itemId: string, checked: boolean) => Promise<void>;
		oncategory: (categoryId: string | null) => Promise<void>;
		onmove: (index: number) => Promise<void>;
		onretry: (linkId: string) => Promise<void>;
		onedit: () => void;
		ondelete: () => Promise<void>;
		onclose: () => void;
	} = $props();

	const category = $derived(categories.find(({ id }) => id === card.categoryId));
	const progress = $derived(checklistProgress(card));
	const personName = (personId: string | null): string | undefined =>
		people.find(({ id }) => id === personId)?.name;
	let viewerPhotoId = $state<string>();
	const viewerIndex = $derived(card.photos.findIndex(({ id }) => id === viewerPhotoId));
</script>

<div
	class="modal modal-open z-100 p-0 sm:p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="planning-card-title"
>
	<article
		class="modal-box flex h-dvh max-h-dvh w-full max-w-2xl flex-col rounded-none p-0 sm:h-auto sm:max-h-[94dvh] sm:rounded-box"
	>
		<header
			class="shrink-0 border-b border-base-300 bg-base-100 px-4 pb-3 sm:px-6 sm:pt-5"
			style="padding-top: max(1rem, env(safe-area-inset-top));"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
						{#if category}
							<span class={`h-2.5 w-2.5 rounded-full ${planningColorStyles[category.color].swatch}`}
							></span>
							{category.name}
						{:else}
							Usortert
						{/if}
					</p>
					<h2 id="planning-card-title" class="font-display text-2xl font-bold wrap-break-word">
						{card.title}
					</h2>
					<p class="text-sm text-base-content/60">Lagt til av {card.createdByName}</p>
				</div>
				<button
					class="btn btn-square h-10 min-h-10 w-10 min-w-10 shrink-0 btn-ghost btn-sm"
					type="button"
					onclick={onclose}
					aria-label="Lukk kortet"><X size={21} /></button
				>
			</div>
		</header>

		<div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
			{#if card.body}<p><LinkedText text={card.body} /></p>{/if}
			{#if card.place}
				<a
					class="inline-flex max-w-full items-center gap-1.5 font-semibold link-primary"
					href={googleMapsPlaceUrl(card.place)}
					target="_blank"
					rel="noopener noreferrer"
				>
					<MapPin class="shrink-0" size={17} aria-hidden="true" />
					<span class="wrap-break-word">{card.place.label}</span>
				</a>
			{/if}
			{#if card.photos.length}
				<section aria-labelledby="planning-card-photos" class="space-y-2">
					<h3 id="planning-card-photos" class="font-bold">Bilder</h3>
					<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{#each card.photos as photo, index (photo.id)}
							<li>
								<button
									class="block w-full rounded-field focus-visible:outline-2 focus-visible:outline-primary"
									type="button"
									onclick={() => (viewerPhotoId = photo.id)}
									aria-label={`Vis bilde ${index + 1}`}
								>
									<PlanningImage
										src={planningPhotoPath(photo.id, 'thumb')}
										alt=""
										class="aspect-square w-full rounded-field bg-base-200 object-cover"
									/>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if card.links.length}
				<section aria-labelledby="planning-card-links" class="space-y-2">
					<h3 id="planning-card-links" class="font-bold">Lenker</h3>
					<ul class="space-y-2">
						{#each card.links as link (link.id)}
							<li><PlanningLinkPreview {link} {canWrite} onretry={() => onretry(link.id)} /></li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if card.checklist.length}
				<section aria-labelledby="planning-card-checklist" class="space-y-2">
					<h3 id="planning-card-checklist" class="font-bold">
						Sjekkliste <span class="font-normal text-base-content/60"
							>{progress.checked}/{progress.total}</span
						>
					</h3>
					<ul class="space-y-1">
						{#each card.checklist as item (item.id)}
							<li>
								<label class="flex min-h-11 cursor-pointer items-center gap-3">
									<input
										class="checkbox checkbox-sm checkbox-primary"
										type="checkbox"
										checked={item.checked}
										disabled={!canWrite}
										onchange={(event) => ontoggle(item.id, event.currentTarget.checked)}
									/>
									<span class="min-w-0 flex-1 wrap-break-word" class:line-through={item.checked}
										>{item.text}</span
									>
									{#if item.checked && personName(item.checkedByPersonId)}
										<span class="shrink-0 text-xs text-base-content/55"
											>{personName(item.checkedByPersonId)}</span
										>
									{/if}
								</label>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			<section aria-labelledby="planning-card-placement" class="space-y-2">
				<h3 id="planning-card-placement" class="font-bold">Plassering</h3>
				<div class="flex items-end gap-2">
					<label class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="label-text">Kategori</span>
						<select
							class="select-bordered select select-sm"
							value={card.categoryId ?? ''}
							disabled={!canWrite}
							onchange={(event) => oncategory(event.currentTarget.value || null)}
						>
							<option value="">Usortert</option>
							{#each categories as option (option.id)}
								<option value={option.id}>{option.name}</option>
							{/each}
						</select>
					</label>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						disabled={!canWrite || sectionIndex === 0}
						onclick={() => onmove(sectionIndex - 1)}
						aria-label="Flytt kortet opp"><ArrowUp size={16} /></button
					>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						disabled={!canWrite || sectionIndex === sectionLength - 1}
						onclick={() => onmove(sectionIndex + 1)}
						aria-label="Flytt kortet ned"><ArrowDown size={16} /></button
					>
				</div>
			</section>
		</div>

		<footer
			class="flex shrink-0 justify-between gap-2 border-t border-base-300 bg-base-100 px-4 pt-3 sm:px-6 sm:pb-5"
			style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
		>
			<button class="btn btn-ghost text-error" type="button" disabled={!canWrite} onclick={ondelete}
				><Trash2 size={17} aria-hidden="true" /> Slett</button
			>
			<button class="btn btn-primary" type="button" disabled={!canWrite} onclick={onedit}
				><Edit3 size={17} aria-hidden="true" /> Rediger</button
			>
		</footer>
	</article>
</div>

{#if viewerIndex >= 0}
	<PlanningPhotoViewer
		photos={card.photos}
		index={viewerIndex}
		onselect={(photoId) => (viewerPhotoId = photoId)}
		onclose={() => (viewerPhotoId = undefined)}
	/>
{/if}
