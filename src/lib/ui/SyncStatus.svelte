<script lang="ts">
	import { CloudCheck, CloudOff, LoaderCircle, TriangleAlert } from '@lucide/svelte';

	import { sharedState } from '$lib/client/state.svelte';

	const label = $derived(
		sharedState.status.phase === 'synced'
			? 'Synkronisert'
			: sharedState.status.phase === 'saving'
				? sharedState.status.pending > 0
					? `Lagrer ${sharedState.status.pending} endringer …`
					: 'Lagrer …'
				: sharedState.status.phase === 'offline'
					? sharedState.status.pending > 0
						? `Uten nett · ${sharedState.status.pending} venter`
						: 'Uten nett'
					: sharedState.status.phase === 'error'
						? 'Kunne ikke synkronisere'
						: 'Kobler til …'
	);
</script>

<p
	class="inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60"
	role="status"
>
	{#if sharedState.status.phase === 'synced'}
		<CloudCheck size={15} />
	{:else if sharedState.status.phase === 'offline'}
		<CloudOff size={15} />
	{:else if sharedState.status.phase === 'error'}
		<TriangleAlert size={15} />
	{:else}
		<LoaderCircle class="animate-spin" size={15} />
	{/if}
	{label}
</p>
