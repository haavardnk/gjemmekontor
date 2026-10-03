<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Card links are validated external HTTP(S) addresses. */

	import { ExternalLink, RotateCw } from '@lucide/svelte';

	import { type PlanningLink, planningLinkHost, planningLinkImagePath } from '../domain/planning';
	import PlanningImage from './PlanningImage.svelte';

	let {
		link,
		canWrite,
		onretry
	}: { link: PlanningLink; canWrite: boolean; onretry: () => Promise<void> } = $props();

	const host = $derived(planningLinkHost(link.url));
</script>

<div class="flex overflow-hidden rounded-box border border-base-300 bg-base-100">
	{#if link.hasImage}
		<PlanningImage
			src={planningLinkImagePath(link.id)}
			alt=""
			class="w-24 shrink-0 self-stretch bg-base-200 object-cover sm:w-36"
		/>
	{/if}
	<div class="min-w-0 flex-1 space-y-1 p-3">
		<a
			class="flex items-start gap-1.5 font-semibold wrap-break-word link-hover"
			href={link.url}
			target="_blank"
			rel="noopener noreferrer"
		>
			<span class="line-clamp-2 min-w-0">{link.title ?? host}</span>
			<ExternalLink class="mt-1 shrink-0 text-base-content/50" size={14} aria-hidden="true" />
		</a>
		{#if link.description}
			<p class="line-clamp-2 text-sm text-base-content/70">{link.description}</p>
		{/if}
		<p class="truncate text-xs text-base-content/55">{link.siteName ?? host}</p>
		{#if link.status === 'pending'}
			<p class="text-xs text-base-content/55">Henter forhåndsvisning …</p>
		{:else if link.status === 'failed'}
			<div class="flex flex-wrap items-center gap-x-2 text-xs text-base-content/55">
				<span>Fant ingen forhåndsvisning.</span>
				<button class="btn btn-ghost btn-xs" type="button" disabled={!canWrite} onclick={onretry}
					><RotateCw size={13} aria-hidden="true" /> Prøv igjen</button
				>
			</div>
		{/if}
	</div>
</div>
