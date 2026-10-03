<script lang="ts">
	import { GripVertical, Image, Link2, ListChecks, MapPin, MessageCircle } from '@lucide/svelte';

	import {
		checklistProgress,
		type PlanningCard,
		planningCardCoverPath,
		reactionSummary
	} from '../domain/planning';
	import { planningReactionStyles } from './planning-reactions';
	import PlanningImage from './PlanningImage.svelte';

	let {
		card,
		accent,
		draggable,
		ondragstart,
		ondragend,
		onopen
	}: {
		card: PlanningCard;
		accent: string;
		draggable: boolean;
		ondragstart: (event: DragEvent) => void;
		ondragend: () => void;
		onopen: () => void;
	} = $props();

	const progress = $derived(checklistProgress(card));
	const coverPath = $derived(planningCardCoverPath(card));
	const reactions = $derived(reactionSummary(card).filter(({ personIds }) => personIds.length));
</script>

<article
	class={`relative flex h-full rounded-box border border-l-4 border-base-300 bg-base-100 shadow-sm ${accent}`}
>
	{#if draggable}
		<button
			class="relative z-10 hidden cursor-grab items-start px-1 pt-3 text-base-content/40 sm:flex"
			type="button"
			draggable="true"
			{ondragstart}
			{ondragend}
			aria-label={`Dra kortet ${card.title}`}><GripVertical size={16} /></button
		>
	{/if}
	<div class="min-w-0 flex-1 space-y-1.5 p-3">
		{#if coverPath}
			<PlanningImage
				src={coverPath}
				alt=""
				class="mb-2 aspect-video w-full rounded-field bg-base-200 object-cover"
			/>
		{/if}
		<h3 class="font-semibold wrap-break-word">
			<button
				class="text-left after:absolute after:inset-0 after:rounded-box focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary"
				type="button"
				onclick={onopen}>{card.title}</button
			>
		</h3>
		{#if card.body}
			<p class="line-clamp-3 text-sm wrap-break-word whitespace-pre-line text-base-content/70">
				{card.body}
			</p>
		{/if}
		{#if card.place || progress.total || card.links.length || card.photos.length || reactions.length || card.comments.length}
			<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/60">
				{#if card.place}
					<span class="flex min-w-0 items-center gap-1">
						<MapPin class="shrink-0" size={13} aria-hidden="true" />
						<span class="truncate">{card.place.label}</span>
					</span>
				{/if}
				{#if progress.total}
					<span class="flex items-center gap-1">
						<ListChecks size={13} aria-hidden="true" />
						{progress.checked}/{progress.total}
					</span>
				{/if}
				{#if card.links.length}
					<span class="flex items-center gap-1">
						<Link2 size={13} aria-hidden="true" />
						{card.links.length}
					</span>
				{/if}
				{#if card.photos.length}
					<span class="flex items-center gap-1">
						<Image size={13} aria-hidden="true" />
						{card.photos.length}
					</span>
				{/if}
				{#if card.comments.length}
					<span class="flex items-center gap-1">
						<MessageCircle size={13} aria-hidden="true" />
						<span class="sr-only">Kommentarer:</span>
						{card.comments.length}
					</span>
				{/if}
				{#each reactions as { reaction, personIds } (reaction)}
					<span class="flex items-center gap-0.5">
						<span aria-hidden="true">{planningReactionStyles[reaction].emoji}</span>
						<span class="sr-only">{planningReactionStyles[reaction].label}:</span>
						{personIds.length}
					</span>
				{/each}
			</div>
		{/if}
	</div>
</article>
