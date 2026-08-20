<script lang="ts">
	import {
		CalendarDays,
		Download,
		ExternalLink,
		Filter,
		Map as MapIcon,
		RefreshCw,
		RotateCcw,
		Satellite,
		Search,
		ShipWheel,
		Trash2,
		X
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import type { OfflineMapRecord } from '$lib/client/database';
	import { sharedState } from '$lib/client/state.svelte';
	import MapSymbol from '$lib/map/MapSymbol.svelte';
	import MapView from '$lib/map/MapView.svelte';
	import {
		downloadOfflineMap,
		removeOfflineMap,
		storedMapSnapshot,
		storedOfflineMaps,
		storeMapSnapshot
	} from '$lib/map/offline';
	import PoiSheet from '$lib/map/PoiSheet.svelte';
	import {
		actualRouteFeatures,
		completedDayNumbers,
		hiddenPlannedRouteIds,
		layerDayNumbers,
		loggedNauticalMiles,
		visibleActualRoutes
	} from '$lib/map/trip-routes';
	import type {
		MapApiResponse,
		MapFeature,
		MapMode,
		MapSnapshot,
		OfflineMapManifest,
		OfflineMapPackage
	} from '$lib/map/types';
	import { tripDayState } from '$lib/trip/day.svelte';
	import { tripDays } from '$lib/trip/days';
	import { mapErrorMessage } from '$lib/ui/copy';

	let snapshot = $state<MapSnapshot>();
	const visibleLayerIds = new SvelteSet<string>();
	const visibleSourceStyleKeys = new SvelteSet<string>();
	let selectedId = $state<string>();
	let query = $state('');
	let filterOpen = $state(false);
	let routeScope = $state<'all' | 'current'>('all');
	const allActualRoutes = $derived(actualRouteFeatures(sharedState.values));
	const actualRoutes = $derived(
		visibleActualRoutes(allActualRoutes, tripDayState.selectedIndex, routeScope === 'current')
	);
	const hiddenRouteIds = $derived(
		hiddenPlannedRouteIds(snapshot?.features ?? [], completedDayNumbers(allActualRoutes))
	);
	const totalNauticalMiles = $derived(loggedNauticalMiles(sharedState.values));
	let mode = $state<MapMode>('normal');
	let online = $state(true);
	let offlinePackages = $state<OfflineMapPackage[]>([]);
	let offlineMaps = $state<OfflineMapRecord[]>([]);
	let downloadingMode = $state<MapMode>();
	let downloadReceived = $state(0);
	let downloadTotal = $state(0);
	let offlineMessage = $state('');
	let refreshing = $state(false);
	let statusMessage = $state('Laster kart …');
	let errorMessage = $state('');
	let sourceMapId = $state('');

	const selected = $derived(snapshot?.features.find((feature) => feature.id === selectedId));
	const selectedSourceStyle = $derived(
		snapshot?.sourceStyles.find((style) => style.key === selected?.properties.sourceStyleKey)
	);
	const activeOfflineMap = $derived(
		online ? undefined : offlineMaps.find((record) => record.id === mode)
	);
	const offlineUnavailable = $derived(!online && !activeOfflineMap);
	const normalizedQuery = $derived(query.trim().toLocaleLowerCase('nb-NO'));
	const results = $derived(
		normalizedQuery && snapshot
			? snapshot.features
					.filter((feature) => feature.geometry.type === 'Point')
					.filter(
						(feature) =>
							visibleLayerIds.size === 0 || visibleLayerIds.has(feature.properties.layerId)
					)
					.filter(
						(feature) =>
							feature.properties.sourceStyleKey === undefined ||
							visibleSourceStyleKeys.size === 0 ||
							visibleSourceStyleKeys.has(feature.properties.sourceStyleKey)
					)
					.filter((feature) =>
						[
							feature.properties.title,
							feature.properties.layerName,
							feature.properties.description,
							...Object.values(feature.properties.extendedData)
						]
							.join(' ')
							.toLocaleLowerCase('nb-NO')
							.includes(normalizedQuery)
					)
					.slice(0, 20)
			: []
	);
	const modeOptions: { mode: MapMode; label: string; icon: typeof MapIcon }[] = [
		{ mode: 'normal', label: 'Vanlig', icon: MapIcon },
		{ mode: 'nautical', label: 'Sjøkart', icon: ShipWheel },
		{ mode: 'satellite', label: 'Satellitt', icon: Satellite }
	];
	const availableOfflineOptions = $derived(
		modeOptions.filter(
			(option) =>
				offlinePackages.some((item) => item.mode === option.mode) ||
				offlineMaps.some((item) => item.id === option.mode)
		)
	);
	const currentMapLayers = $derived(
		(snapshot?.layers ?? []).filter((layer) =>
			layerDayNumbers(layer.name).includes(tripDayState.selectedIndex + 1)
		)
	);
	const currentTripDay = $derived(tripDays[tripDayState.selectedIndex]);

	async function errorCode(response: Response): Promise<string | undefined> {
		try {
			const body = (await response.json()) as { error?: unknown };
			return typeof body.error === 'string' ? body.error : undefined;
		} catch {
			return undefined;
		}
	}

	async function applyResponse(response: MapApiResponse): Promise<void> {
		const previousSelection = selectedId;
		snapshot = response.snapshot;
		sourceMapId = response.sourceMapId ?? sourceMapId;
		if (
			previousSelection &&
			!response.snapshot.features.some((feature) => feature.id === previousSelection)
		) {
			selectedId = undefined;
			statusMessage = 'Punktet finnes ikke lenger i Google-kartet.';
			return;
		}
		statusMessage = response.stale
			? 'Viser sist lagrede kart.'
			: `Oppdatert ${new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' }).format(new Date(response.snapshot.fetchedAt))}`;
		if (response.error) {
			errorMessage = mapErrorMessage(response.error);
		}
		await storeMapSnapshot(response.snapshot);
	}

	async function load(method: 'GET' | 'POST' = 'GET'): Promise<void> {
		refreshing = method === 'POST';
		errorMessage = '';
		try {
			const response = await fetch(method === 'GET' ? '/api/map' : '/api/map/refresh', { method });
			if (!response.ok) {
				errorMessage = mapErrorMessage(await errorCode(response));
				return;
			}
			await applyResponse((await response.json()) as MapApiResponse);
		} catch {
			errorMessage = 'Får ikke kontakt med serveren. Viser sist lagrede kart hvis det finnes.';
		} finally {
			refreshing = false;
		}
	}

	function toggleLayer(id: string): void {
		if (visibleLayerIds.has(id)) {
			visibleLayerIds.delete(id);
		} else {
			visibleLayerIds.add(id);
		}
	}

	function toggleSourceStyle(key: string): void {
		if (visibleSourceStyleKeys.has(key)) {
			visibleSourceStyleKeys.delete(key);
		} else {
			visibleSourceStyleKeys.add(key);
		}
	}

	function showAllSourceStyles(): void {
		visibleSourceStyleKeys.clear();
	}

	function resetFilters(): void {
		visibleSourceStyleKeys.clear();
		visibleLayerIds.clear();
		routeScope = 'all';
		selectedId = undefined;
	}

	function showCurrentMapItems(): void {
		visibleLayerIds.clear();
		for (const layer of currentMapLayers) {
			visibleLayerIds.add(layer.id);
		}
		routeScope = 'current';
		selectedId = undefined;
	}

	function showAllMapItems(): void {
		visibleLayerIds.clear();
		routeScope = 'all';
	}

	function selectFeature(feature: MapFeature): void {
		selectedId = feature.id;
		query = '';
	}

	function selectMode(selectedMode: MapMode): void {
		mode = selectedMode;
		localStorage.setItem('mapMode', selectedMode);
	}

	function formatSize(size: number): string {
		return new Intl.NumberFormat('nb-NO', {
			style: 'unit',
			unit: size >= 1_000_000 ? 'megabyte' : 'kilobyte',
			unitDisplay: 'short',
			maximumFractionDigits: 1
		}).format(size / (size >= 1_000_000 ? 1_000_000 : 1_000));
	}

	async function loadOfflineMaps(): Promise<void> {
		offlineMaps = await storedOfflineMaps();
		if (!navigator.onLine) {
			return;
		}
		try {
			const response = await fetch('/api/map/offline');
			if (response.ok) {
				offlinePackages = ((await response.json()) as OfflineMapManifest).packages;
			}
		} catch {
			offlineMessage = 'Kunne ikke hente kartpakkene akkurat nå.';
		}
	}

	async function bootstrapMap(): Promise<void> {
		const cached = await storedMapSnapshot();
		if (cached) {
			snapshot = cached.value;
			statusMessage = 'Viser kartet som er lagret på enheten.';
		}
		await load();
	}

	async function downloadPackage(mapPackage: OfflineMapPackage): Promise<void> {
		downloadingMode = mapPackage.mode;
		downloadReceived = 0;
		downloadTotal = mapPackage.size;
		offlineMessage = '';
		try {
			const record = await downloadOfflineMap(mapPackage, ({ received, total }) => {
				downloadReceived = received;
				downloadTotal = total;
			});
			offlineMaps = [...offlineMaps.filter((item) => item.id !== record.id), record];
			offlineMessage = `${mapPackage.name} er lagret på enheten.`;
		} catch {
			offlineMessage = 'Nedlastingen ble avbrutt. Prøv igjen når du har nett.';
		} finally {
			downloadingMode = undefined;
		}
	}

	async function deletePackage(selectedMode: MapMode): Promise<void> {
		await removeOfflineMap(selectedMode);
		offlineMaps = offlineMaps.filter((record) => record.id !== selectedMode);
		offlineMessage = 'Kartpakken er slettet fra enheten.';
	}

	onMount(() => {
		const savedMode = localStorage.getItem('mapMode');
		if (savedMode === 'normal' || savedMode === 'nautical' || savedMode === 'satellite') {
			mode = savedMode;
		}
		online = navigator.onLine;
		const updateOnlineStatus = (): void => {
			online = navigator.onLine;
			if (online) {
				void loadOfflineMaps();
			}
		};
		window.addEventListener('online', updateOnlineStatus);
		window.addEventListener('offline', updateOnlineStatus);
		void bootstrapMap();
		void loadOfflineMaps();
		return (): void => {
			window.removeEventListener('online', updateOnlineStatus);
			window.removeEventListener('offline', updateOnlineStatus);
		};
	});
</script>

<svelte:head><title>Kart · Gjemmekontor</title></svelte:head>

<section
	class="relative h-[calc(100dvh-7.5rem)] min-h-96 overflow-hidden lg:h-[calc(100dvh-3.5rem)]"
>
	{#if snapshot}
		<MapView
			{snapshot}
			{visibleLayerIds}
			{visibleSourceStyleKeys}
			{selectedId}
			{mode}
			{actualRoutes}
			{hiddenRouteIds}
			offlineMap={activeOfflineMap}
			onselect={(id) => (selectedId = id)}
		/>
	{:else}
		<div class="grid size-full place-items-center bg-base-200">
			<p class="text-sm font-semibold text-base-content/65">{statusMessage}</p>
		</div>
	{/if}

	<div class="absolute inset-x-3 top-3 z-20 flex flex-col gap-2 lg:right-auto lg:w-[32rem]">
		<div class="flex items-start gap-2">
			<div class="relative min-w-0 flex-1">
				<label class="input flex w-full items-center gap-2 bg-base-100 shadow">
					<Search size={18} />
					<input
						class="min-w-0 grow"
						type="search"
						placeholder="Søk i kartet"
						aria-label="Søk i kartet"
						bind:value={query}
					/>
					{#if query}
						<button
							class="btn btn-square btn-ghost btn-xs"
							type="button"
							onclick={() => (query = '')}
							aria-label="Tøm søket"
							title="Tøm søket"><X size={16} /></button
						>
					{/if}
				</label>
				{#if normalizedQuery}
					<ul
						class="absolute mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
					>
						{#each results as feature (feature.id)}
							<li>
								<button
									class="flex w-full flex-col px-3 py-2 text-left hover:bg-base-200"
									type="button"
									onclick={() => selectFeature(feature)}
									><span class="font-semibold">{feature.properties.title}</span><span
										class="text-xs text-base-content/60">{feature.properties.layerName}</span
									></button
								>
							</li>
						{:else}
							<li class="px-3 py-3 text-sm text-base-content/65">Ingen treff.</li>
						{/each}
					</ul>
				{/if}
			</div>
			<button
				class="btn btn-square bg-base-100 shadow"
				type="button"
				onclick={() => (filterOpen = true)}
				aria-label="Velg kartlag"
				title="Velg kartlag"><Filter size={19} /></button
			>
			<button
				class="btn btn-square bg-base-100 shadow"
				type="button"
				onclick={() => load('POST')}
				disabled={refreshing}
				aria-label="Oppdater kartet"
				title="Oppdater kartet"
				><span class:animate-spin={refreshing}><RefreshCw size={19} /></span></button
			>
		</div>
		<div class="flex w-fit gap-2 self-center lg:self-start" aria-label="Karttype">
			{#each modeOptions as option (option.mode)}
				<button
					class="btn gap-1.5 shadow btn-sm"
					class:btn-primary={mode === option.mode}
					class:bg-base-100={mode !== option.mode}
					type="button"
					onclick={() => selectMode(option.mode)}
					aria-pressed={mode === option.mode}
				>
					<option.icon size={16} />
					{option.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col-reverse gap-2">
		<p class="w-fit rounded bg-base-100/95 px-3 py-1.5 text-xs font-medium shadow" role="status">
			{statusMessage}{#if totalNauticalMiles > 0}
				<span class="font-normal text-base-content/45" data-trip-nautical-miles>
					<span class="mx-1.5">·</span>{totalNauticalMiles.toLocaleString('nb-NO', {
						maximumFractionDigits: 1
					})} nm
				</span>
			{/if}
		</p>
		{#if errorMessage}<p
				class="w-fit max-w-sm rounded bg-error px-3 py-2 text-sm text-error-content shadow"
				role="alert"
			>
				{errorMessage}
			</p>{/if}
		{#if offlineUnavailable}<p
				class="w-fit max-w-sm rounded bg-warning px-3 py-2 text-sm text-warning-content shadow"
				role="alert"
			>
				Denne karttypen er ikke lastet ned. Velg en lagret karttype eller gå på nett.
			</p>{/if}
	</div>

	{#if filterOpen && snapshot}
		<button
			class="absolute inset-0 z-30 bg-neutral/30"
			type="button"
			onclick={() => (filterOpen = false)}
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
					onclick={() => (filterOpen = false)}
					aria-label="Lukk kartlag"
					title="Lukk kartlag"><X size={20} /></button
				>
			</div>
			<button
				class="btn mb-1 w-full gap-2 btn-sm"
				type="button"
				onclick={resetFilters}
				disabled={visibleSourceStyleKeys.size === 0 && visibleLayerIds.size === 0}
			>
				<RotateCcw size={16} />
				Nullstill filtre
			</button>
			<section class="border-b border-base-300 py-4">
				<h3 class="mb-1 text-sm font-bold">Dagens kartpunkter</h3>
				<p class="mb-3 text-xs leading-5 text-base-content/60">
					{#if currentMapLayers.length > 0}
						{currentMapLayers.map((layer) => layer.name).join(', ')}
					{:else}
						Ingen dagsmappe for {currentTripDay?.dateLabel.toLocaleLowerCase('nb-NO')}.
					{/if}
				</p>
				<div class="join w-full">
					<button
						class="btn join-item flex-1 btn-sm"
						type="button"
						disabled={currentMapLayers.length === 0}
						onclick={showCurrentMapItems}
					>
						<CalendarDays size={16} />
						Dagens etappe
					</button>
					<button class="btn join-item flex-1 btn-sm" type="button" onclick={showAllMapItems}>
						Vis alle
					</button>
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
						<button class="btn btn-ghost btn-xs" type="button" onclick={showAllSourceStyles}>
							Vis alle
						</button>
					{/if}
				</div>
				<div class="space-y-1">
					{#each snapshot.sourceStyles as style (style.key)}
						<button
							class={`flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-base-300 px-2 py-2 text-left text-sm ${visibleSourceStyleKeys.has(style.key) ? 'bg-primary/10' : ''}`}
							data-source-icon-href={style.iconHref}
							type="button"
							aria-pressed={visibleSourceStyleKeys.has(style.key)}
							onclick={() => toggleSourceStyle(style.key)}
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
						<button class="btn btn-ghost btn-xs" type="button" onclick={showAllMapItems}>
							Vis alle
						</button>
					{/if}
				</div>
				<div class="space-y-1">
					{#each snapshot.layers as layer (layer.id)}
						<button
							class={`flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-base-300 px-2 py-2 text-left text-sm ${visibleLayerIds.has(layer.id) ? 'bg-primary/10' : ''}`}
							type="button"
							aria-pressed={visibleLayerIds.has(layer.id)}
							onclick={() => toggleLayer(layer.id)}
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
									onclick={() => downloadPackage(mapPackage)}
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
									onclick={() => deletePackage(option.mode)}
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
					>.
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

	{#if selected && snapshot}
		<PoiSheet
			feature={selected}
			sourceStyle={selectedSourceStyle}
			fetchedAt={snapshot.fetchedAt}
			onclose={() => (selectedId = undefined)}
		/>
	{/if}
</section>
