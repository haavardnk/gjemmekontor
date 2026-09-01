<script lang="ts">
	import { CloudCheck, CloudOff, LoaderCircle, TriangleAlert } from '@lucide/svelte';

	import { offlineApi } from '$lib/client/offline-api.svelte';
	import { sharedState } from '$lib/client/state.svelte';

	let { moduleId }: { moduleId?: string } = $props();
	const status = $derived(moduleId ? offlineApi.status(moduleId) : sharedState.status);

	const label = $derived(
		status.phase === 'synced'
			? 'Synkronisert'
			: status.phase === 'saving'
				? status.pending > 0
					? `Lagrer ${status.pending} endringer …`
					: 'Lagrer …'
				: status.phase === 'offline'
					? status.pending > 0
						? `Uten nett · ${status.pending} venter`
						: 'Uten nett'
					: status.phase === 'conflict'
						? 'Endring krever gjennomgang'
						: status.phase === 'error'
							? 'Kunne ikke synkronisere'
							: 'Kobler til …'
	);
</script>

<p
	class="inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60"
	role="status"
>
	{#if status.phase === 'synced'}
		<CloudCheck size={15} />
	{:else if status.phase === 'offline'}
		<CloudOff size={15} />
	{:else if status.phase === 'error' || status.phase === 'conflict'}
		<TriangleAlert size={15} />
	{:else}
		<LoaderCircle class="animate-spin" size={15} />
	{/if}
	{label}
</p>
