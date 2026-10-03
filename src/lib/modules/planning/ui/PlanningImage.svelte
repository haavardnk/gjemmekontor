<script lang="ts">
	import { page } from '$app/state';

	import { cachedPlanningImage } from '../client/images';

	let {
		src,
		cachedSrc = src,
		alt,
		class: className = ''
	}: { src: string; cachedSrc?: string; alt: string; class?: string } = $props();
	let fallback = $state<{ src: string; url: string }>();

	async function loadFallback(): Promise<void> {
		const tripId = page.data.tripId;
		const failedSrc = src;
		if (fallback?.src === failedSrc || !tripId) return;
		const blob = await cachedPlanningImage(tripId, cachedSrc).catch(() => undefined);
		if (blob && src === failedSrc) fallback = { src: failedSrc, url: URL.createObjectURL(blob) };
	}

	$effect(() => {
		const url = fallback?.url;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

<img
	src={fallback?.src === src ? fallback.url : src}
	{alt}
	class={className}
	loading="lazy"
	onerror={loadFallback}
/>
