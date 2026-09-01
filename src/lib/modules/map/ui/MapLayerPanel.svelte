<script lang="ts">
	import {
		CalendarDays,
		Download,
		ExternalLink,
		Map as MapIcon,
		RotateCcw,
		Satellite,
		Ship,
		ShipWheel,
		Trash2,
		X
	} from '@lucide/svelte';
	import type { SvelteSet } from 'svelte/reactivity';

	import type { MapMode, MapSnapshot, OfflineMapPackage } from '$lib/modules/map/domain/types';
	import type { OfflineMapRecord } from '$lib/modules/map/public';
	import MapSymbol from '$lib/modules/map/ui/MapSymbol.svelte';

	let {
		open = $bindable(),
		snapshot,
		visibleLayerIds,
		visibleSourceStyleKeys,
		currentLayers,
		currentDateLabel,
		sourceMapId,
		aisAllowed,
		aisEnabled,
		aisStatusLabel,
		offlinePackages,
		offlineMaps,
		downloadingMode,
		downloadReceived,
		downloadTotal,
		offlineMessage,
		onreset,
		ontoggleAis,
		onshowCurrent,
		onshowAll,
		onshowAllStyles,
		ontoggleStyle,
		ontoggleLayer,
		ondownload,
		ondelete
	}: {
		open: boolean;
		snapshot: MapSnapshot;
		visibleLayerIds: SvelteSet<string>;
		visibleSourceStyleKeys: SvelteSet<string>;
		currentLayers: MapSnapshot['layers'];
		currentDateLabel?: string;
		sourceMapId: string;
		aisAllowed: boolean;
		aisEnabled: boolean;
		aisStatusLabel: string;
		offlinePackages: OfflineMapPackage[];
		offlineMaps: OfflineMapRecord[];
		downloadingMode?: MapMode;
		downloadReceived: number;
		downloadTotal: number;
		offlineMessage: string;
		onreset: () => void;
		ontoggleAis: () => void;
		onshowCurrent: () => void;
		onshowAll: () => void;
		onshowAllStyles: () => void;
		ontoggleStyle: (key: string) => void;
		ontoggleLayer: (id: string) => void;
		ondownload: (mapPackage: OfflineMapPackage) => void;
		ondelete: (mode: MapMode) => void;
	} = $props();

	const modeOptions = [
		{ mode: 'normal', label: 'Vanlig', icon: MapIcon },
		{ mode: 'nautical', label: 'Sjøkart', icon: ShipWheel },
		{ mode: 'satellite', label: 'Satellitt', icon: Satellite }
	] as const;
	const availableOfflineOptions = $derived(
		modeOptions.filter(
			(option) =>
				offlinePackages.some((item) => item.mode === option.mode) ||
				offlineMaps.some((item) => item.id === option.mode)
		)
	);

	function formatSize(size: number): string {
		return new Intl.NumberFormat('nb-NO', {
			style: 'unit',
			unit: size >= 1_000_000 ? 'megabyte' : 'kilobyte',
			unitDisplay: 'short',
			maximumFractionDigits: 1
		}).format(size / (size >= 1_000_000 ? 1_000_000 : 1_000));
	}
</script>

{#if open}
	<button
		class="absolute inset-0 z-30 bg-neutral/30"
		type="button"
		onclick={() => (open = false)}
		aria-label="Lukk kartlag"
	></button>
	<aside
		class="absolute inset-x-0 bottom-0 z-40 max-h-[75%] overflow-y-auto rounded-t-lg bg-base-100 p-4 shadow-2xl lg:inset-y-4 lg:right-4 lg:left-auto lg:w-96 lg:rounded-lg"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="font-display text-2xl font-bold">Kartlag</h2>
			<button
				class="btn btn-square btn-ghost btn-sm"
				type="button"
				onclick={() => (open = false)}
				aria-label="Lukk kartlag"
				title="Lukk kartlag"><X size={20} /></button
			>
		</div>
		<button
			class="btn mb-1 w-full gap-2 btn-sm"
			type="button"
			onclick={onreset}
			disabled={visibleSourceStyleKeys.size === 0 && visibleLayerIds.size === 0}
		>
			<RotateCcw size={16} />
			Nullstill filtre
		</button>
		{#if aisAllowed}<section class="border-b border-base-300 py-4" data-ais-controls>
				<button
					class={`flex min-h-14 w-full items-center gap-3 rounded-lg border border-base-300 px-3 py-2 text-left ${aisEnabled ? 'bg-primary/10' : ''}`}
					type="button"
					aria-pressed={aisEnabled}
					onclick={ontoggleAis}
					data-ais-toggle
				>
					<span
						class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
					>
						<Ship size={18} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block text-sm font-bold">AIS-fartøy</span>
						<span class="mt-0.5 block text-xs text-base-content/55" role="status">
							{aisStatusLabel}
						</span>
					</span>
					<span
						class="relative h-6 w-11 shrink-0 rounded-full transition-colors"
						class:bg-primary={aisEnabled}
						class:bg-base-300={!aisEnabled}
						aria-hidden="true"
					>
						<span
							class="absolute top-1 size-4 rounded-full bg-white shadow transition-transform"
							class:translate-x-6={aisEnabled}
							class:translate-x-1={!aisEnabled}
						></span>
					</span>
				</button>
			</section>{/if}
		<section class="border-b border-base-300 py-4">
			<h3 class="mb-1 text-sm font-bold">Dagens kartpunkter</h3>
			<p class="mb-3 text-xs leading-5 text-base-content/60">
				{#if currentLayers.length > 0}
					{currentLayers.map((layer) => layer.name).join(', ')}
				{:else}
					Google-kartets dagsmapper dekker 5.–18. september. Alle kartpunkter vises for
					{currentDateLabel?.toLocaleLowerCase('nb-NO')}.
				{/if}
			</p>
			<div class="join w-full">
				<button
					class="btn join-item flex-1 btn-sm"
					type="button"
					disabled={currentLayers.length === 0}
					onclick={onshowCurrent}
				>
					<CalendarDays size={16} />
					Dagens etappe
				</button>
				<button class="btn join-item flex-1 btn-sm" type="button" onclick={onshowAll}
					>Vis alle</button
				>
			</div>
		</section>
		<section class="border-b border-base-300 py-4">
			<h3 class="mb-1 text-sm font-bold">Typer kartpunkter</h3>
			<div class="mb-3 flex items-center justify-between gap-3">
				<p class="text-xs leading-5 text-base-content/60">
					{visibleSourceStyleKeys.size === 0
						? 'Alle typer vises.'
						: `${visibleSourceStyleKeys.size} ${visibleSourceStyleKeys.size === 1 ? 'type' : 'typer'} vises.`}
				</p>
				{#if visibleSourceStyleKeys.size > 0}
					<button class="btn btn-ghost btn-xs" type="button" onclick={onshowAllStyles}
						>Vis alle</button
					>
				{/if}
			</div>
			<div class="space-y-1">
				{#each snapshot.sourceStyles as style (style.key)}
					<button
						class={`flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-base-300 px-2 py-2 text-left text-sm ${visibleSourceStyleKeys.has(style.key) ? 'bg-primary/10' : ''}`}
						data-source-icon-href={style.iconHref}
						type="button"
						aria-pressed={visibleSourceStyleKeys.has(style.key)}
						onclick={() => ontoggleStyle(style.key)}
					>
						<MapSymbol symbol={style.symbol} color={style.color} size={32} />
						<span class="min-w-0 flex-1 font-semibold">{style.label}</span>
						<span class="text-xs text-base-content/55">{style.count}</span>
					</button>
				{/each}
			</div>
		</section>
		<section class="border-b border-base-300 py-4">
			<h3 class="mb-1 text-sm font-bold">Grupper i Google-kartet</h3>
			{#if sourceMapId}
				<a
					class="btn mb-3 w-full gap-2 btn-outline btn-sm"
					href={`https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(sourceMapId)}`}
					target="_blank"
					rel="noreferrer"
				>
					<ExternalLink size={16} />
					Åpne hele kartet i Google Maps
				</a>
			{/if}
			<div class="mb-3 flex items-center justify-between gap-3">
				<p class="text-xs leading-5 text-base-content/60">
					{visibleLayerIds.size === 0
						? 'Alle grupper vises.'
						: `${visibleLayerIds.size} ${visibleLayerIds.size === 1 ? 'gruppe' : 'grupper'} vises.`}
				</p>
				{#if visibleLayerIds.size > 0}
					<button class="btn btn-ghost btn-xs" type="button" onclick={onshowAll}>Vis alle</button>
				{/if}
			</div>
			<div class="space-y-1">
				{#each snapshot.layers as layer (layer.id)}
					<button
						class={`flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-base-300 px-2 py-2 text-left text-sm ${visibleLayerIds.has(layer.id) ? 'bg-primary/10' : ''}`}
						type="button"
						aria-pressed={visibleLayerIds.has(layer.id)}
						onclick={() => ontoggleLayer(layer.id)}
					>
						<span class="size-3 shrink-0 rounded-full" style={`background:${layer.color}`}></span>
						<span class="min-w-0 flex-1 font-semibold">{layer.name}</span>
						<span class="text-xs text-base-content/55">{layer.featureCount}</span>
					</button>
				{/each}
			</div>
		</section>
		<section class="py-4" data-offline-maps>
			<h3 class="mb-1 text-sm font-bold">Kart uten nett</h3>
			<p class="mb-3 text-xs leading-5 text-base-content/60">
				Last ned kartet før avreise. Appen bruker den lagrede utgaven automatisk når du er uten
				nett.
			</p>
			<div class="space-y-2">
				{#each availableOfflineOptions as option (option.mode)}
					{@const mapPackage = offlinePackages.find((item) => item.mode === option.mode)}
					{@const storedMap = offlineMaps.find((item) => item.id === option.mode)}
					<div class="flex min-h-14 items-center gap-3 border-b border-base-300 py-2">
						<option.icon class="shrink-0" size={18} />
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold">{option.label}</p>
							<p class="text-xs text-base-content/55">
								{#if downloadingMode === option.mode}
									{formatSize(downloadReceived)} av {formatSize(downloadTotal)}
								{:else if storedMap}
									Lagret · {formatSize(storedMap.size)}
								{:else if mapPackage}
									{formatSize(mapPackage.size)}
								{/if}
							</p>
							{#if downloadingMode === option.mode}
								<progress
									class="progress mt-1 h-1.5 w-full progress-primary"
									value={downloadReceived}
									max={downloadTotal}
								></progress>
							{/if}
						</div>
						{#if mapPackage && downloadingMode !== option.mode}
							<button
								class="btn gap-1.5 btn-sm"
								type="button"
								onclick={() => ondownload(mapPackage)}
								disabled={downloadingMode !== undefined}
							>
								<Download size={15} />
								{storedMap?.version === mapPackage.version
									? 'Last ned på nytt'
									: storedMap
										? 'Oppdater'
										: 'Last ned'}
							</button>
						{/if}
						{#if storedMap}
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								onclick={() => ondelete(option.mode)}
								aria-label={`Slett ${option.label.toLocaleLowerCase('nb-NO')}`}
								title={`Slett ${option.label.toLocaleLowerCase('nb-NO')}`}
								><Trash2 size={16} /></button
							>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-base-content/55">Ingen kartpakker er tilgjengelige.</p>
				{/each}
			</div>
			{#if offlineMessage}<p class="mt-3 text-xs font-medium" role="status">
					{offlineMessage}
				</p>{/if}
		</section>
		<div class="space-y-2 border-t border-base-300 pt-4 text-xs leading-5 text-base-content/65">
			<p>
				Kilder:
				<a class="link" href="https://openfreemap.org/" target="_blank" rel="noreferrer"
					>OpenFreeMap</a
				>,
				<a class="link" href="https://www.openseamap.org/" target="_blank" rel="noreferrer"
					>OpenSeaMap</a
				>,
				<a class="link" href="https://aisstream.io/" target="_blank" rel="noreferrer">AISStream</a>.
			</p>
			<a
				class="link font-semibold"
				href="https://www.hhi.hr/proizvodi-i-usluge/pomorske-navigacijske-karte"
				target="_blank"
				rel="noreferrer">Offisielle kroatiske sjøkart hos HHI</a
			>
		</div>
	</aside>
{/if}
