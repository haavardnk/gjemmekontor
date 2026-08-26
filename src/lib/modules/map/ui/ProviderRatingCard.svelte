<script lang="ts">
	import { ExternalLink, Star } from '@lucide/svelte';

	import PhotoGallery from './PhotoGallery.svelte';

	type Provider = 'Google' | 'Tripadvisor';
	type ProviderPhoto = {
		thumbnailUrl: string;
		imageUrl: string;
		caption?: string;
		contributor?: string;
	};

	let {
		provider,
		rating,
		reviewCount,
		webUrl,
		photos = [],
		photosLoading = false,
		photosUnavailable = false,
		attributions = [],
		divided = false
	}: {
		provider: Provider;
		rating?: number;
		reviewCount?: number;
		webUrl?: string;
		photos?: readonly ProviderPhoto[];
		photosLoading?: boolean;
		photosUnavailable?: boolean;
		attributions?: readonly string[];
		divided?: boolean;
	} = $props();
</script>

<div
	class:border-t={divided}
	class="space-y-3 border-base-300 bg-base-200/30 p-3"
	aria-label={`${provider}-vurderinger`}
	data-google-place-details={provider === 'Google' ? '' : undefined}
	data-tripadvisor-details={provider === 'Tripadvisor' ? '' : undefined}
>
	<div class="flex items-center gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex items-baseline gap-2">
				{#if provider === 'Google'}
					<img
						class="h-4 w-auto"
						src="https://www.gstatic.com/images/branding/googlelogo/1x/googlelogo_color_74x24dp.png"
						alt="Google"
					/>
				{:else}
					<h4 class="text-sm font-bold">Tripadvisor</h4>
				{/if}
				{#if reviewCount !== undefined}
					<span class="truncate text-xs text-base-content/55">
						{reviewCount.toLocaleString('nb-NO')} vurderinger
					</span>
				{/if}
			</div>
		</div>
		{#if rating !== undefined}
			<span class="flex items-center gap-1 text-lg font-bold" aria-label={`${rating} av 5`}>
				<Star class="text-warning" size={17} fill="currentColor" />
				{rating.toLocaleString('nb-NO', { maximumFractionDigits: 1 })}
			</span>
		{/if}
		{#if webUrl}
			<a
				class="btn btn-square btn-ghost btn-sm"
				href={webUrl}
				target="_blank"
				rel="external noreferrer"
				aria-label={provider === 'Google'
					? 'Åpne stedet i Google Maps'
					: 'Åpne stedet på Tripadvisor'}><ExternalLink size={17} /></a
			>
		{/if}
	</div>

	{#if photosLoading}
		<PhotoGallery photos={[]} providerLabel={provider} loading />
	{:else if photosUnavailable}
		<p class="text-xs text-base-content/50">
			{provider === 'Google'
				? 'Google-vurderinger er midlertidig utilgjengelige.'
				: 'Ingen Tripadvisor-bilder tilgjengelig.'}
		</p>
	{:else if photos.length > 0}
		<PhotoGallery {photos} providerLabel={provider} />
	{:else}
		<p class="text-xs text-base-content/50">Ingen {provider}-bilder tilgjengelig.</p>
	{/if}

	{#each attributions as attribution (attribution)}
		<p class="text-[0.65rem] text-base-content/45">{attribution}</p>
	{/each}
</div>
