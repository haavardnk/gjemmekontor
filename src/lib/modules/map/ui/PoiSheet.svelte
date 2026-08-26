<script lang="ts">
	import { ExternalLink, MapPin, X } from '@lucide/svelte';

	import {
		enrichmentTechnicalFields,
		isPoiEnrichmentEligible,
		providerSearchTitle
	} from '../domain/enrichment';
	import type { OpenFreeMapRestaurant } from '../domain/openfreemap';
	import type { MapFeature, MapSourceStyleLegend } from '../domain/types';
	import MapSymbol from './MapSymbol.svelte';
	import PoiEnrichment from './PoiEnrichment.svelte';

	let {
		feature,
		sourceStyle,
		fetchedAt,
		openFreeMapRestaurant,
		online,
		onclose
	}: {
		feature: MapFeature;
		sourceStyle: MapSourceStyleLegend | undefined;
		fetchedAt?: string;
		openFreeMapRestaurant?: OpenFreeMapRestaurant;
		online: boolean;
		onclose: () => void;
	} = $props();
	const point = $derived(
		feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined
	);
	const googleMapsPlaceQuery = $derived(
		encodeURIComponent(
			[providerSearchTitle(feature), feature.properties.address].filter(Boolean).join(', ')
		)
	);
	const googleMapsPositionQuery = $derived(
		point ? encodeURIComponent(`${point[1]},${point[0]}`) : ''
	);
	let googleMatch = $state<{ featureId: string; state: 'loading' | 'matched' | 'unmatched' }>({
		featureId: '',
		state: 'loading'
	});
	const googleMatchState = $derived(
		googleMatch.featureId === feature.id ? googleMatch.state : 'loading'
	);
	const hiddenFields = new Set([
		'description',
		'name',
		'naziv',
		'opis',
		'title',
		...enrichmentTechnicalFields
	]);
	const enrichmentEligible = $derived(isPoiEnrichmentEligible(feature));
	const fieldLabels: Record<string, string> = {
		address: 'Adresse',
		depth: 'Dybde',
		dybde: 'Dybde',
		phone: 'Telefon',
		'sea bed': 'Bunnforhold',
		telefon: 'Telefon',
		website: 'Nettside',
		'wind protection': 'Vindbeskyttelse'
	};
	const fields = $derived(
		Object.entries(feature.properties.extendedData).filter(
			([name, value]) => value.trim() && !hiddenFields.has(name.trim().toLocaleLowerCase())
		)
	);
	const updated = $derived(
		fetchedAt
			? new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(
					new Date(fetchedAt)
				)
			: undefined
	);

	function richText(element: HTMLElement, content: string): { update: (value: string) => void } {
		element.innerHTML = content;
		return {
			update: (value): void => {
				element.innerHTML = value;
			}
		};
	}

	function fieldLabel(name: string): string {
		return fieldLabels[name.toLocaleLowerCase()] ?? name;
	}

	function updateGoogleMatch(state: 'loading' | 'matched' | 'unmatched'): void {
		googleMatch = { featureId: feature.id, state };
	}
</script>

<aside
	class="absolute inset-x-0 bottom-0 z-30 max-h-[88%] overflow-y-auto rounded-t-xl border-t border-base-300 bg-base-100 shadow-2xl lg:inset-y-4 lg:right-4 lg:left-auto lg:max-h-none lg:w-96 lg:rounded-xl lg:border"
	data-poi-sheet
>
	<div class="sticky top-0 z-10 border-b border-base-300 bg-base-100 px-4 pt-3 pb-4">
		<div class="min-w-0 pr-10">
			<div class="flex min-w-0 items-center gap-2 text-xs font-semibold">
				{#if sourceStyle}
					<div
						class="flex max-w-[55%] shrink-0 items-center gap-1.5 rounded-full bg-base-200 py-0.5 pr-2 pl-0.5"
						data-source-icon-href={sourceStyle.iconHref}
						title={sourceStyle.iconHref
							? `Kildesymbol: ${sourceStyle.iconHref}`
							: sourceStyle.label}
					>
						<MapSymbol symbol={sourceStyle.symbol} color={sourceStyle.color} size={24} />
						<span class="truncate">{sourceStyle.label}</span>
					</div>
				{/if}
				<span class="truncate text-primary">{feature.properties.layerName}</span>
			</div>
			<h2 class="font-display mt-2 text-2xl leading-[1.08] font-bold text-neutral">
				{feature.properties.title}
			</h2>
		</div>
		<button
			class="btn absolute top-3 right-3 btn-square btn-ghost btn-sm"
			type="button"
			onclick={onclose}
			aria-label="Lukk detaljer"
			title="Lukk detaljer"
		>
			<X size={20} />
		</button>
	</div>
	<div class="space-y-4 p-4">
		{#if online && enrichmentEligible}
			{#key feature.id}
				<PoiEnrichment
					featureId={feature.id}
					{openFreeMapRestaurant}
					onGoogleMatchState={updateGoogleMatch}
				/>
			{/key}
		{/if}
		{#if feature.properties.description}
			<section>
				<h3 class="mb-1 text-xs font-semibold text-base-content/55">Beskrivelse</h3>
				<div
					class="map-rich-text text-sm leading-6 text-base-content/80"
					use:richText={feature.properties.description}
				></div>
			</section>
		{/if}
		{#if fields.length > 0}
			<dl
				class="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-200/50 px-3 text-sm"
			>
				{#each fields as [name, value] (name)}
					{#if value}
						<div class="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-3">
							<dt class="font-semibold whitespace-nowrap text-base-content/60">
								{fieldLabel(name)}
							</dt>
							<dd class="map-rich-text min-w-0 font-medium break-words" use:richText={value}></dd>
						</div>
					{/if}
				{/each}
			</dl>
		{/if}
		{#if point}
			{#if !enrichmentEligible || !online || googleMatchState === 'unmatched'}
				<a
					class="btn w-full btn-outline btn-sm"
					href={`https://www.google.com/maps/search/?api=1&query=${googleMapsPlaceQuery || googleMapsPositionQuery}`}
					target="_blank"
					rel="noreferrer"
				>
					<ExternalLink size={18} />
					Åpne i Google Maps
				</a>
			{/if}
		{/if}
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-3 text-xs text-base-content/50"
		>
			{#if point}
				<span class="flex items-center gap-1.5 font-mono">
					<MapPin size={14} />
					{point[1].toFixed(5)}, {point[0].toFixed(5)}
				</span>
			{/if}
			{#if updated}<span>Oppdatert {updated}</span>{/if}
		</div>
	</div>
</aside>
