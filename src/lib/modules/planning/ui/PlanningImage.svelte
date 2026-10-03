<script lang="ts">
	import { page } from '$app/state';

	import { cachedPlanningImage } from '../client/images';

	let {
		src,
		cachedSrc = src,
		alt,
		class: className = ''
	}: { src: string; cachedSrc?: string; alt: string; class?: string } = $props();
	let fallbackUrl = $state<string>();

	async function fallback(): Promise<void> {
		const tripId = page.data.tripId;
		if (fallbackUrl || !tripId) return;
		const blob = await cachedPlanningImage(tripId, cachedSrc).catch(() => undefined);
		if (blob) fallbackUrl = URL.createObjectURL(blob);
	}

	$effect(() => {
		const url = fallbackUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

<img src={fallbackUrl ?? src} {alt} class={className} loading="lazy" onerror={fallback} />
