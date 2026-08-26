<script lang="ts">
	import { onMount } from 'svelte';

	import {
		fetchGooglePlacePresentation,
		type GooglePlacePresentation
	} from '../client/google-places-loader';
	import ProviderRatingCard from './ProviderRatingCard.svelte';

	let { placeId, apiKey }: { placeId: string; apiKey: string } = $props();
	let details = $state<GooglePlacePresentation>();
	let loadingState = $state<'loading' | 'ready' | 'unavailable'>('loading');

	onMount(() => {
		let disposed = false;
		void fetchGooglePlacePresentation(placeId, apiKey)
			.then((value) => {
				if (disposed) return;
				details = value;
				loadingState = 'ready';
			})
			.catch(() => {
				if (!disposed) loadingState = 'unavailable';
			});
		return (): void => {
			disposed = true;
		};
	});
</script>

<ProviderRatingCard
	provider="Google"
	rating={details?.rating}
	reviewCount={details?.reviewCount}
	webUrl={details?.webUrl}
	openingHours={details?.openingHours}
	photos={details?.photos}
	photosLoading={loadingState === 'loading'}
	photosUnavailable={loadingState === 'unavailable'}
	attributions={details?.attributions}
/>
