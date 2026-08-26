<script lang="ts">
	import { onMount } from 'svelte';

	import {
		type PoiEnrichmentResponse,
		poiEnrichmentResponseSchema,
		tripadvisorPhotosResponseSchema
	} from '../domain/enrichment';
	import type { OpenFreeMapRestaurant } from '../domain/openfreemap';
	import GooglePlaceDetails from './GooglePlaceDetails.svelte';
	import ProviderRatingCard from './ProviderRatingCard.svelte';

	type GoogleMatchState = 'loading' | 'matched' | 'unmatched';

	let {
		featureId,
		openFreeMapRestaurant,
		onGoogleMatchState
	}: {
		featureId: string;
		openFreeMapRestaurant?: OpenFreeMapRestaurant;
		onGoogleMatchState?: (state: GoogleMatchState) => void;
	} = $props();
	let enrichment = $state<PoiEnrichmentResponse>();
	let loadingState = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let photosLoading = $state(false);
	let photosFailed = $state(false);
	let controller: AbortController | undefined;
	let photosController: AbortController | undefined;

	function request(path: '' | '/photos', signal: AbortSignal): Promise<Response> {
		if (!openFreeMapRestaurant) {
			return fetch(`/api/map/poi/${encodeURIComponent(featureId)}/enrichment${path}`, {
				signal,
				cache: 'no-store'
			});
		}
		return fetch(`/api/map/poi/openfreemap/enrichment${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(openFreeMapRestaurant),
			signal,
			cache: 'no-store'
		});
	}

	onMount(() => {
		onGoogleMatchState?.('loading');
		controller = new AbortController();
		void request('', controller.signal)
			.then(async (response) => {
				if (!response.ok) throw new Error('POI_ENRICHMENT_UNAVAILABLE');
				enrichment = poiEnrichmentResponseSchema.parse(await response.json());
				onGoogleMatchState?.(enrichment.google.status === 'available' ? 'matched' : 'unmatched');
				loadingState = 'ready';
				if (enrichment.tripadvisor.status === 'available' && !enrichment.tripadvisor.photosLoaded) {
					void loadPhotos();
				}
			})
			.catch((error: unknown) => {
				if (!(error instanceof Error && error.name === 'AbortError')) {
					onGoogleMatchState?.('unmatched');
					loadingState = 'unavailable';
				}
			});
		return (): void => {
			controller?.abort();
			photosController?.abort();
		};
	});

	async function loadPhotos(): Promise<void> {
		if (!enrichment || photosLoading) return;
		photosLoading = true;
		photosController = new AbortController();
		try {
			const response = await request('/photos', photosController.signal);
			if (!response.ok) throw new Error('TRIPADVISOR_PHOTOS_UNAVAILABLE');
			const result = tripadvisorPhotosResponseSchema.parse(await response.json());
			enrichment = { ...enrichment, tripadvisor: result.tripadvisor };
		} catch {
			photosFailed = true;
		} finally {
			photosLoading = false;
		}
	}
</script>

{#if loadingState === 'loading'}
	<section class="space-y-2 rounded-lg border border-base-300 p-3" aria-label="Laster vurderinger">
		<div class="h-3 w-20 skeleton"></div>
		<div class="h-20 w-full skeleton"></div>
	</section>
{:else if loadingState === 'unavailable'}
	<p class="text-sm text-base-content/60">Vurderinger er midlertidig utilgjengelige.</p>
{:else if enrichment}
	{#if enrichment.google.status === 'available' || enrichment.tripadvisor.status === 'available'}
		<section class="overflow-hidden rounded-lg border border-base-300" aria-label="Vurderinger">
			<h3 class="border-b border-base-300 px-3 py-2 text-xs font-semibold text-base-content/55">
				Vurderinger
			</h3>
			{#if enrichment.google.status === 'available'}
				<GooglePlaceDetails
					placeId={enrichment.google.placeId}
					apiKey={enrichment.google.uiKitKey}
				/>
			{/if}

			{#if enrichment.tripadvisor.status === 'available'}
				{@const tripadvisor = enrichment.tripadvisor}
				<ProviderRatingCard
					provider="Tripadvisor"
					rating={tripadvisor.rating}
					reviewCount={tripadvisor.reviewCount}
					webUrl={tripadvisor.webUrl}
					photos={tripadvisor.photos}
					photosLoading={!tripadvisor.photosLoaded && !photosFailed}
					photosUnavailable={photosFailed}
					divided={enrichment.google.status === 'available'}
				/>
			{/if}
		</section>
	{/if}
{/if}
