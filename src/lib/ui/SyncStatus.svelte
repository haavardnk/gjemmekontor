<script lang="ts">
	import { CloudCheck, CloudOff, LoaderCircle, TriangleAlert } from '@lucide/svelte';

	import { cachedResources } from '$lib/client/cached-resources.svelte';
	import { connectivity } from '$lib/client/connectivity.svelte';
	import { sharedState } from '$lib/client/state.svelte';

	let { moduleId }: { moduleId?: string } = $props();
	const status = $derived(moduleId ? cachedResources.status(moduleId) : sharedState.status);

	const label = $derived(
		!connectivity.online
			? 'Uten nett · kun lesing'
			: status.phase === 'synced'
				? 'Synkronisert'
				: status.phase === 'saving'
					? 'Lagrer …'
					: status.phase === 'offline'
						? 'Uten nett · kun lesing'
						: status.phase === 'error'
							? 'Kunne ikke synkronisere'
							: 'Kobler til …'
	);
</script>

<p
	class="inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60"
	role="status"
>
	{#if !connectivity.online}
		<CloudOff size={15} />
	{:else if status.phase === 'synced'}
		<CloudCheck size={15} />
	{:else if status.phase === 'offline'}
		<CloudOff size={15} />
	{:else if status.phase === 'error'}
		<TriangleAlert size={15} />
	{:else}
		<LoaderCircle class="animate-spin" size={15} />
	{/if}
	{label}
</p>
