<script lang="ts">
	import { ExternalLink, MapPin, X } from '@lucide/svelte';

	import MapSymbol from './MapSymbol.svelte';
	import type { MapFeature, MapSourceStyleLegend } from './types';

	let {
		feature,
		sourceStyle,
		fetchedAt,
		onclose
	}: {
		feature: MapFeature;
		sourceStyle: MapSourceStyleLegend | undefined;
		fetchedAt: string;
		onclose: () => void;
	} = $props();
	const point = $derived(
		feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined
	);
	const googleMapsQuery = $derived(
		point
			? encodeURIComponent(
					[feature.properties.title, feature.properties.address, `${point[1]},${point[0]}`]
						.filter(Boolean)
						.join(' ')
				)
			: ''
	);
	const hiddenFields = new Set(['description', 'name', 'opis', 'title']);
	const fieldLabels: Record<string, string> = {
		address: 'Adresse',
		depth: 'Dybde',
		dybde: 'Dybde',
		naziv: 'Navn',
		phone: 'Telefon',
		telefon: 'Telefon',
		website: 'Nettside'
	};
	const fields = $derived(
		Object.entries(feature.properties.extendedData).filter(
			([name, value]) => value.trim() && !hiddenFields.has(name.trim().toLocaleLowerCase())
		)
	);
	const updated = $derived(
		new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(fetchedAt)
		)
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
</script>

<aside
	class="absolute inset-x-0 bottom-0 z-30 max-h-[78%] overflow-y-auto rounded-t-lg border-t border-base-300 bg-base-100 shadow-2xl lg:inset-y-4 lg:right-4 lg:left-auto lg:max-h-none lg:w-96 lg:rounded-lg lg:border"
>
	<div
		class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-base-300 bg-base-100 p-5"
	>
		<div class="min-w-0">
			<p class="text-xs font-semibold text-primary">{feature.properties.layerName}</p>
			<h2 class="font-display mt-1 text-2xl leading-tight font-bold text-neutral">
				{feature.properties.title}
			</h2>
		</div>
		<button
			class="btn btn-square btn-ghost btn-sm"
			type="button"
			onclick={onclose}
			aria-label="Lukk detaljer"
			title="Lukk detaljer"
		>
			<X size={20} />
		</button>
	</div>
	<div class="space-y-5 p-5">
		{#if sourceStyle}
			<div
				class="flex w-fit items-center gap-2 rounded-full bg-base-200 py-1 pr-3 pl-1 text-sm font-semibold"
				data-source-icon-href={sourceStyle.iconHref}
				title={`Google-symbol: ${sourceStyle.iconHref}`}
			>
				<MapSymbol symbol={sourceStyle.symbol} color={sourceStyle.color} size={30} />
				<span>{sourceStyle.label}</span>
			</div>
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
						<div class="grid grid-cols-[6rem_1fr] gap-3 py-3">
							<dt class="font-semibold break-words text-base-content/60">{fieldLabel(name)}</dt>
							<dd class="map-rich-text min-w-0 font-medium break-words" use:richText={value}></dd>
						</div>
					{/if}
				{/each}
			</dl>
		{/if}
		{#if point}
			<div class="flex items-center gap-3 rounded-lg border border-base-300 p-3">
				<span
					class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
				>
					<MapPin size={18} />
				</span>
				<div class="min-w-0">
					<p class="text-xs font-semibold text-base-content/55">Posisjon</p>
					<p class="mt-0.5 font-mono text-sm font-semibold">
						{point[1].toFixed(5)}, {point[0].toFixed(5)}
					</p>
				</div>
			</div>
			<a
				class="btn w-full btn-primary"
				href={`https://www.google.com/maps/search/?api=1&query=${googleMapsQuery}`}
				target="_blank"
				rel="noreferrer"
			>
				<ExternalLink size={18} />
				Åpne i Google Maps
			</a>
		{/if}
		<p class="border-t border-base-300 pt-4 text-xs text-base-content/50">
			Google My Maps · Oppdatert {updated}
		</p>
	</div>
</aside>
