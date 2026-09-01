<script lang="ts">
	import {
		Filter,
		Map as MapIcon,
		RefreshCw,
		Satellite,
		Search,
		ShipWheel,
		X
	} from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import { page } from '$app/state';
	import { ApiError, apiRequest } from '$lib/client/api';
	import { createOfflineResource } from '$lib/client/offline-resource';
	import { watchOnlineStatus } from '$lib/client/online';
	import { sharedState } from '$lib/client/state.svelte';
	import {
		actualRouteFeatures,
		completedDayNumbers,
		hiddenPlannedRouteIds,
		layerDayNumbers,
		loggedNauticalMiles,
		visibleActualRoutes
	} from '$lib/modules/logbook/public';
	import { startAisPolling } from '$lib/modules/map/client/ais-poller';
	import {
		downloadOfflineMap,
		mapSnapshotKey,
		removeOfflineMap,
		storedOfflineMaps
	} from '$lib/modules/map/client/offline';
	import type { AisApiResponse } from '$lib/modules/map/domain/ais';
	import {
		type OpenFreeMapRestaurant,
		openFreeMapRestaurantFeature,
		openFreeMapRestaurantSourceStyle
	} from '$lib/modules/map/domain/openfreemap';
	import {
		type MapApiResponse,
		type MapFeature,
		type MapMode,
		type MapSnapshot,
		mapSnapshotSchema,
		type OfflineMapManifest,
		type OfflineMapPackage
	} from '$lib/modules/map/domain/types';
	import type { OfflineMapRecord } from '$lib/modules/map/public';
	import type { MapOverlay } from '$lib/modules/map/server/config';
	import MapLayerPanel from '$lib/modules/map/ui/MapLayerPanel.svelte';
	import MapView from '$lib/modules/map/ui/MapView.svelte';
	import PoiSheet from '$lib/modules/map/ui/PoiSheet.svelte';
	import VesselSheet from '$lib/modules/map/ui/VesselSheet.svelte';
	import { tripDayState } from '$lib/trip/day.svelte';
	import { mapErrorMessage } from '$lib/ui/copy';

	let { defaultMode, enabledOverlays }: { defaultMode: MapMode; enabledOverlays: MapOverlay[] } =
		$props();
	let snapshot = $state<MapSnapshot>();
	const visibleLayerIds = new SvelteSet<string>();
	const visibleSourceStyleKeys = new SvelteSet<string>();
	let selectedId = $state<string>();
	let selectedOpenFreeMapRestaurant = $state<OpenFreeMapRestaurant>();
	let query = $state('');
	let filterOpen = $state(false);
	let routeScope = $state<'all' | 'current'>('all');
	const logbookEnabled = $derived(page.data.enabledModuleIds?.includes('logbook') ?? true);
	const tripId = $derived(page.data.tripId ?? '');
	const tripDays = $derived(page.data.tripDays ?? []);
	const currentMapDayIndex = $derived(tripDayState.todayIndex ?? tripDayState.selectedIndex);
	const allActualRoutes = $derived(
		logbookEnabled ? actualRouteFeatures(sharedState.values, tripDays) : []
	);
	const actualRoutes = $derived(
		visibleActualRoutes(allActualRoutes, currentMapDayIndex, routeScope === 'current')
	);
	const hiddenRouteIds = $derived(
		hiddenPlannedRouteIds(snapshot?.features ?? [], completedDayNumbers(allActualRoutes))
	);
	const totalNauticalMiles = $derived(
		logbookEnabled ? loggedNauticalMiles(sharedState.values, tripDays) : 0
	);
	let mode = $state<MapMode>(untrack(() => defaultMode));
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
	let aisEnabled = $state(false);
	let aisPreferenceReady = $state(false);
	let pageVisible = $state(true);
	let selectedAisMmsi = $state<number>();
	let aisResponse = $state<AisApiResponse>({
		type: 'FeatureCollection',
		features: [],
		status: 'idle'
	});
	const aisAllowed = $derived(enabledOverlays.includes('ais'));
	const depthContoursEnabled = $derived(enabledOverlays.includes('depth-contours'));
	const modeStorageKey = $derived(`mapMode:${tripId}`);
	const aisStorageKey = $derived(`mapAisEnabled:${tripId}`);
	const mapResource = createOfflineResource({
		moduleId: 'map',
		snapshotKey: mapSnapshotKey,
		endpoint: '/api/map',
		select: (response) =>
			response && typeof response === 'object' && 'snapshot' in response
				? response.snapshot
				: undefined,
		schema: mapSnapshotSchema,
		read: () => snapshot,
		write: (value) => (snapshot = value),
		onCached: () => {
			statusMessage = 'Viser kartet som er lagret på enheten.';
		},
		onRefreshSuccess: (value, response) => applyResponse(value, response as MapApiResponse),
		onRefreshError: (error) => {
			errorMessage =
				error instanceof ApiError
					? mapErrorMessage(error.code)
					: 'Får ikke kontakt med serveren. Viser sist lagrede kart hvis det finnes.';
		},
		registerRefresher: false
	});

	const selectedImportedFeature = $derived(
		snapshot?.features.find((feature) => feature.id === selectedId)
	);
	const selectedOpenFreeMapFeature = $derived(
		selectedOpenFreeMapRestaurant
			? openFreeMapRestaurantFeature(
					selectedOpenFreeMapRestaurant,
					`openfreemap-client:${selectedOpenFreeMapRestaurant.longitude.toFixed(5)}:${selectedOpenFreeMapRestaurant.latitude.toFixed(5)}:${selectedOpenFreeMapRestaurant.title}`
				)
			: undefined
	);
	const selected = $derived(selectedOpenFreeMapFeature ?? selectedImportedFeature);
	const selectedSourceStyle = $derived(
		selectedOpenFreeMapRestaurant
			? openFreeMapRestaurantSourceStyle
			: snapshot?.sourceStyles.find((style) => style.key === selected?.properties.sourceStyleKey)
	);
	const selectedAisVessel = $derived(
		aisResponse.features.find((feature) => feature.properties.mmsi === selectedAisMmsi)
	);
	const visibleAisVessels = $derived(aisEnabled ? aisResponse.features : []);
	const aisStatusLabel = $derived(
		!online
			? 'Ikke tilgjengelig uten nett'
			: aisResponse.status === 'connected'
				? `${aisResponse.features.length} ${aisResponse.features.length === 1 ? 'fartøy' : 'fartøy'}`
				: aisResponse.status === 'connecting'
					? 'Kobler til AIS …'
					: aisResponse.status === 'reconnecting'
						? 'Kobler til AIS på nytt …'
						: aisResponse.status === 'error'
							? 'AIS er midlertidig utilgjengelig'
							: 'AIS er av'
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
					.filter((feature) =>
						[
							feature.properties.title,
							feature.properties.address,
							feature.properties.layerName,
							...feature.properties.layerPath,
							feature.properties.snippet,
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
	const currentMapLayers = $derived(
		(snapshot?.layers ?? []).filter((layer) =>
			layerDayNumbers(layer.name).includes(currentMapDayIndex + 1)
		)
	);
	const currentTripDay = $derived(tripDays[currentMapDayIndex]);

	function applyResponse(next: MapSnapshot, response: MapApiResponse): void {
		const previousSelection = selectedId;
		sourceMapId = response.sourceMapId ?? sourceMapId;
		if (previousSelection && !next.features.some((feature) => feature.id === previousSelection)) {
			selectedId = undefined;
			statusMessage = 'Punktet finnes ikke lenger i Google-kartet.';
			return;
		}
		statusMessage = response.stale
			? 'Viser sist lagrede kart.'
			: `Oppdatert ${new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' }).format(new Date(next.fetchedAt))}`;
		if (response.error) {
			errorMessage = mapErrorMessage(response.error);
		}
	}

	async function refreshMap(): Promise<void> {
		refreshing = true;
		errorMessage = '';
		await mapResource.refresh({
			load: () => apiRequest<MapApiResponse>('/api/map/refresh', { method: 'POST' })
		});
		refreshing = false;
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
		selectedOpenFreeMapRestaurant = undefined;
		selectedAisMmsi = undefined;
	}

	function showCurrentMapItems(): void {
		visibleLayerIds.clear();
		for (const layer of currentMapLayers) {
			visibleLayerIds.add(layer.id);
		}
		routeScope = 'current';
		selectedId = undefined;
		selectedOpenFreeMapRestaurant = undefined;
	}

	function showAllMapItems(): void {
		visibleLayerIds.clear();
		routeScope = 'all';
	}

	function selectFeature(feature: MapFeature): void {
		selectedId = feature.id;
		selectedOpenFreeMapRestaurant = undefined;
		selectedAisMmsi = undefined;
		query = '';
	}

	function toggleAis(): void {
		if (!aisAllowed) return;
		aisEnabled = !aisEnabled;
		localStorage.setItem(aisStorageKey, String(aisEnabled));
		if (!aisEnabled) {
			selectedAisMmsi = undefined;
		}
	}

	function selectMode(selectedMode: MapMode): void {
		mode = selectedMode;
		selectedOpenFreeMapRestaurant = undefined;
		localStorage.setItem(modeStorageKey, selectedMode);
	}

	function closePoi(): void {
		selectedId = undefined;
		selectedOpenFreeMapRestaurant = undefined;
	}

	async function loadOfflineMaps(): Promise<void> {
		offlineMaps = await storedOfflineMaps(tripId);
		if (!navigator.onLine) {
			return;
		}
		try {
			offlinePackages = (await apiRequest<OfflineMapManifest>('/api/map/offline')).packages;
		} catch {
			offlineMessage = 'Kunne ikke hente kartpakkene akkurat nå.';
		}
	}

	async function downloadPackage(mapPackage: OfflineMapPackage): Promise<void> {
		downloadingMode = mapPackage.mode;
		downloadReceived = 0;
		downloadTotal = mapPackage.size;
		offlineMessage = '';
		try {
			const record = await downloadOfflineMap(tripId, mapPackage, ({ received, total }) => {
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
		await removeOfflineMap(tripId, selectedMode);
		offlineMaps = offlineMaps.filter((record) => record.id !== selectedMode);
		offlineMessage = 'Kartpakken er slettet fra enheten.';
	}

	$effect(() => {
		if (!aisAllowed || !aisPreferenceReady || !aisEnabled || !online || !pageVisible) {
			return;
		}
		return startAisPolling({
			onData: (response) => (aisResponse = response),
			onError: () => (aisResponse = { ...aisResponse, status: 'error', error: 'AIS_UNAVAILABLE' })
		});
	});

	onMount(() => {
		const savedMode = localStorage.getItem(modeStorageKey);
		if (savedMode === 'normal' || savedMode === 'nautical' || savedMode === 'satellite') {
			mode = savedMode;
		}
		aisEnabled = aisAllowed && localStorage.getItem(aisStorageKey) !== 'false';
		aisPreferenceReady = true;
		pageVisible = document.visibilityState === 'visible';
		let initialized = false;
		const stopOnline = watchOnlineStatus((value) => {
			online = value;
			if (initialized && online) {
				void loadOfflineMaps();
			}
			initialized = true;
		});
		const updateVisibility = (): void => {
			pageVisible = document.visibilityState === 'visible';
		};
		document.addEventListener('visibilitychange', updateVisibility);
		const stopResource = mapResource.start();
		void loadOfflineMaps();
		return (): void => {
			stopResource();
			stopOnline();
			document.removeEventListener('visibilitychange', updateVisibility);
		};
	});
</script>

<svelte:head><title>Kart · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section
	class="relative h-[calc(100dvh-7.5rem)] min-h-96 overflow-hidden lg:h-[calc(100dvh-3.5rem)]"
>
	{#if snapshot}
		<MapView
			{snapshot}
			{visibleLayerIds}
			{visibleSourceStyleKeys}
			{selectedId}
			selectedFeature={selected}
			{mode}
			{tripId}
			{depthContoursEnabled}
			{actualRoutes}
			{hiddenRouteIds}
			aisVessels={visibleAisVessels}
			{selectedAisMmsi}
			offlineMap={activeOfflineMap}
			onselect={(id) => {
				selectedId = id;
				selectedOpenFreeMapRestaurant = undefined;
				selectedAisMmsi = undefined;
			}}
			onselectopenfreemap={(restaurant) => {
				selectedOpenFreeMapRestaurant = restaurant;
				selectedId = undefined;
				selectedAisMmsi = undefined;
			}}
			onselectais={(mmsi) => {
				selectedAisMmsi = mmsi;
				selectedId = undefined;
				selectedOpenFreeMapRestaurant = undefined;
			}}
		/>
	{:else}
		<div class="grid size-full place-items-center bg-base-200">
			<p class="text-sm font-semibold text-base-content/65">{statusMessage}</p>
		</div>
	{/if}

	<div
		class="absolute inset-x-3 top-3 z-20 flex flex-col gap-2 lg:right-auto lg:w-[32rem]"
		data-map-controls
	>
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
				onclick={refreshMap}
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

	{#if snapshot}
		<MapLayerPanel
			bind:open={filterOpen}
			{snapshot}
			{visibleLayerIds}
			{visibleSourceStyleKeys}
			currentLayers={currentMapLayers}
			currentDateLabel={currentTripDay?.dateLabel}
			{sourceMapId}
			{aisAllowed}
			{aisEnabled}
			{aisStatusLabel}
			{offlinePackages}
			{offlineMaps}
			{downloadingMode}
			{downloadReceived}
			{downloadTotal}
			{offlineMessage}
			onreset={resetFilters}
			ontoggleAis={toggleAis}
			onshowCurrent={showCurrentMapItems}
			onshowAll={showAllMapItems}
			onshowAllStyles={showAllSourceStyles}
			ontoggleStyle={toggleSourceStyle}
			ontoggleLayer={toggleLayer}
			ondownload={downloadPackage}
			ondelete={deletePackage}
		/>
	{/if}

	{#if selected && snapshot}
		<PoiSheet
			feature={selected}
			sourceStyle={selectedSourceStyle}
			fetchedAt={selectedOpenFreeMapRestaurant ? undefined : snapshot.fetchedAt}
			openFreeMapRestaurant={selectedOpenFreeMapRestaurant}
			{online}
			onclose={closePoi}
		/>
	{/if}
	{#if selectedAisVessel}
		<VesselSheet vessel={selectedAisVessel} onclose={() => (selectedAisMmsi = undefined)} />
	{/if}
</section>
