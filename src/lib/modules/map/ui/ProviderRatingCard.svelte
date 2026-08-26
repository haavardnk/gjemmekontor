<script lang="ts">
	import { ChevronDown, ExternalLink, Star } from '@lucide/svelte';

	import type { GoogleOpeningHoursPresentation } from '../client/google-places-loader';
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
		openingHours,
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
		openingHours?: GoogleOpeningHoursPresentation;
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
	<div class="flex items-start gap-3">
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
			{#if provider === 'Google' && openingHours}
				<details class="group mt-1 text-xs" data-google-opening-hours>
					<summary class="inline-flex cursor-pointer list-none items-center gap-1.5 marker:hidden">
						{#if openingHours.isOpen === true}
							<span class="font-semibold text-success">Åpent nå</span>
						{:else if openingHours.isOpen === false}
							<span class="font-semibold text-base-content/65">Stengt nå</span>
						{:else}
							<span class="font-semibold">Åpningstider</span>
						{/if}
						<span aria-hidden="true" class="text-base-content/35">·</span>
						<span class="text-base-content/65">I dag {openingHours.todayHours}</span>
						<ChevronDown
							class="text-base-content/40 transition-transform group-open:rotate-180"
							size={13}
						/>
					</summary>
					<dl class="mt-1.5 max-w-64 border-l border-base-300 pl-2 text-xs">
						{#each openingHours.weekdays as day (day.dayIndex)}
							<div class="flex justify-between gap-4 py-0.5">
								<dt
									class="font-medium"
									class:text-primary={day.dayIndex === openingHours.todayDayIndex}
								>
									{day.label}
								</dt>
								<dd class="text-right text-base-content/60">{day.hours}</dd>
							</div>
						{/each}
					</dl>
				</details>
			{/if}
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
