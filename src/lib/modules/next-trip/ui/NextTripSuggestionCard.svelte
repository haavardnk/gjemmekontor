<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Suggestion URLs are validated external URLs. */

	import { Edit3, EllipsisVertical, ExternalLink, Star, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import type { NextTripSuggestion } from '../domain/next-trip';
	import { suggestionRatingSummary } from '../domain/next-trip';
	import LinkedText from './LinkedText.svelte';
	import { websiteLabel } from './links';
	import NextTripComments from './NextTripComments.svelte';

	let {
		suggestion,
		selectedPersonId,
		online,
		onrate,
		onedit,
		ondelete,
		onaddcomment,
		onupdatecomment,
		ondeletecomment
	}: {
		suggestion: NextTripSuggestion;
		selectedPersonId: string;
		online: boolean;
		onrate: (score: number) => Promise<void>;
		onedit: () => void;
		ondelete: () => Promise<void>;
		onaddcomment: (body: string) => Promise<void>;
		onupdatecomment: (commentId: string, body: string) => Promise<void>;
		ondeletecomment: (commentId: string) => Promise<void>;
	} = $props();

	const summary = $derived(suggestionRatingSummary(suggestion));
	const currentRating = $derived(
		suggestion.ratings.find((rating) => rating.personId === selectedPersonId)?.score ?? 0
	);
	const linkLabel = $derived(suggestion.url ? websiteLabel(suggestion.url) : '');
	let actionMenu = $state<HTMLDetailsElement>();

	function closeActionMenu(): void {
		if (actionMenu) actionMenu.open = false;
	}

	function edit(): void {
		closeActionMenu();
		onedit();
	}

	async function remove(): Promise<void> {
		closeActionMenu();
		await ondelete();
	}

	onMount(() => {
		function closeOutside(event: PointerEvent): void {
			if (actionMenu && !actionMenu.contains(event.target as Node)) closeActionMenu();
		}
		document.addEventListener('pointerdown', closeOutside);
		return (): void => document.removeEventListener('pointerdown', closeOutside);
	});
</script>

<article class="space-y-3 rounded-box border border-base-300 p-4">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h3 class="font-display text-2xl wrap-break-word">{suggestion.destination}</h3>
			<p class="text-sm text-base-content/60">Forslag fra {suggestion.submittedByName}</p>
		</div>
		<div class="flex shrink-0 items-start gap-1">
			<div class="mr-1 text-right">
				<strong class="text-xl">{summary.average ? summary.average.toFixed(1) : '–'}</strong>
				<p class="text-xs text-base-content/60">
					{summary.count}
					{summary.count === 1 ? 'vurdering' : 'vurderinger'}
				</p>
			</div>
			<details class="dropdown dropdown-end" bind:this={actionMenu}>
				<summary
					class="btn btn-square h-10 min-h-10 w-10 min-w-10 list-none btn-ghost btn-sm"
					aria-label={`Flere valg for ${suggestion.destination}`}
				>
					<EllipsisVertical size={19} aria-hidden="true" />
				</summary>
				<ul
					class="menu dropdown-content z-20 mt-1 w-44 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
				>
					<li>
						<button type="button" disabled={!online} onclick={edit}>
							<Edit3 size={17} aria-hidden="true" /> Rediger
						</button>
					</li>
					<li>
						<button class="text-error" type="button" disabled={!online} onclick={remove}>
							<Trash2 size={17} aria-hidden="true" /> Slett
						</button>
					</li>
				</ul>
			</details>
		</div>
	</div>
	{#if suggestion.note}<p><LinkedText text={suggestion.note} /></p>{/if}
	{#if suggestion.url}<a
			class="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold link-primary"
			href={suggestion.url}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`Åpne ${linkLabel} i ny fane`}
		>
			<ExternalLink class="shrink-0" size={16} aria-hidden="true" />
			<span class="truncate">{linkLabel}</span>
		</a>{/if}
	{#if selectedPersonId}
		<div
			class="flex items-center gap-1"
			role="group"
			aria-label={`Din vurdering: ${currentRating || 'ikke vurdert'}`}
		>
			{#each [1, 2, 3, 4, 5] as score (score)}
				<button
					class="btn btn-square btn-ghost btn-sm"
					type="button"
					aria-label={`${score} stjerner`}
					disabled={!online}
					aria-pressed={score === currentRating}
					onclick={() => onrate(score)}
				>
					<Star size={20} fill={score <= currentRating ? 'currentColor' : 'none'} />
				</button>
			{/each}
		</div>
	{/if}
	<NextTripComments
		comments={suggestion.comments}
		canComment={Boolean(selectedPersonId)}
		{online}
		onadd={onaddcomment}
		onupdate={onupdatecomment}
		ondelete={ondeletecomment}
	/>
</article>
