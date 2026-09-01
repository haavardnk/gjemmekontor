<script lang="ts">
	import { LocateFixed, Maximize, Navigation, Navigation2 } from '@lucide/svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { Protocol } from 'pmtiles';
	import { onMount } from 'svelte';

	import type { ActualRouteFeature } from '$lib/modules/logbook/public';
	import {
		loadMapCamera,
		type MapCamera,
		mapCameraStorageKey,
		removeMapCamera,
		storeMapCamera
	} from '$lib/modules/map/client/camera';
	import { mapStyle } from '$lib/modules/map/client/map-style';
	import { loadMapMarkerImages } from '$lib/modules/map/client/marker-images';
	import type { AisVesselFeature } from '$lib/modules/map/domain/ais';
	import type { OpenFreeMapRestaurant } from '$lib/modules/map/domain/openfreemap';
	import type { OfflineMapRecord } from '$lib/modules/map/public';

	import type { MapFeature, MapMode, MapSnapshot, Position } from '../domain/types';
	import {
		addApplicationLayers as buildApplicationLayers,
		ensureMapMarkerImages,
		type MapMarkerImages
	} from './map-application-layers';
	import { registerMapInteractions } from './map-interactions';
	import {
		locationMessage as messageForLocation,
		type LocationState,
		MapLocationController
	} from './map-location';
	import { aisFeatureCollection, isGeoJsonSource, mapFeatureCollection } from './map-sources';
	import { focusSelectedPoint } from './selected-point-camera';

	let {
		snapshot,
		visibleLayerIds,
		visibleSourceStyleKeys,
		selectedId,
		selectedFeature,
		mode,
		tripId,
		depthContoursEnabled,
		offlineMap,
		actualRoutes,
		hiddenRouteIds,
		aisVessels,
		selectedAisMmsi,
		onselect,
		onselectopenfreemap,
		onselectais
	}: {
		snapshot: MapSnapshot;
		visibleLayerIds: Set<string>;
		visibleSourceStyleKeys: Set<string>;
		selectedId: string | undefined;
		selectedFeature: MapFeature | undefined;
		mode: MapMode;
		tripId: string;
		depthContoursEnabled: boolean;
		offlineMap: OfflineMapRecord | undefined;
		actualRoutes: ActualRouteFeature[];
		hiddenRouteIds: Set<string>;
		aisVessels: AisVesselFeature[];
		selectedAisMmsi: number | undefined;
		onselect: (id: string) => void;
		onselectopenfreemap: (restaurant: OpenFreeMapRestaurant) => void;
		onselectais: (mmsi: number) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let locationState = $state<LocationState>('idle');
	let following = $state(false);
	let bearing = $state(0);
	let vesselHeading = $state(0);
	let vesselSpeedKnots = $state<number>();
	let cameraChanged = $state(false);
	let mapReady = $state(false);
	let styleRequest = 0;
	let markerImages: MapMarkerImages = {};
	let resettingCamera = false;
	let selectedPoint: Position | undefined;
	const protocol = new Protocol({ metadata: true });
	const locationController = new MapLocationController(
		() => map,
		(view) => {
			locationState = view.state;
			following = view.following;
			vesselHeading = view.heading;
			vesselSpeedKnots = view.speedKnots;
		}
	);
	const cameraStorageKey = $derived(mapCameraStorageKey(tripId));
	const vesselSpeedLabel = $derived(
		vesselSpeedKnots?.toLocaleString('nb-NO', {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		}) ?? ''
	);
	const vesselHeadingLabel = $derived(
		`${String(Math.round(vesselHeading) % 360).padStart(3, '0')}°`
	);

	const locationMessage = $derived(messageForLocation(locationState));

	function locate(): void {
		locationController.locate();
	}

	function updateBearing(): void {
		bearing = map?.getBearing() ?? 0;
	}

	function resetBearing(): void {
		map?.resetNorth({ duration: 300 });
	}

	function saveCamera(): void {
		if (!map) {
			return;
		}
		if (resettingCamera) {
			resettingCamera = false;
			return;
		}
		const center = map.getCenter();
		const camera: MapCamera = {
			center: [center.lng, center.lat],
			zoom: map.getZoom(),
			bearing: map.getBearing(),
			pitch: map.getPitch()
		};
		cameraChanged = true;
		storeMapCamera(sessionStorage, cameraStorageKey, camera);
	}

	function resetCamera(): void {
		if (!map) {
			return;
		}
		resettingCamera = true;
		cameraChanged = false;
		removeMapCamera(sessionStorage, cameraStorageKey);
		map.fitBounds(snapshot.bounds, { padding: 40, duration: 300 });
	}

	function featureCollection(kind: 'points' | 'lines') {
		return mapFeatureCollection(snapshot, kind, {
			selectedId,
			visibleLayerIds,
			visibleSourceStyleKeys,
			hiddenRouteIds
		});
	}

	function selectedAisFeatures() {
		return aisFeatureCollection(aisVessels, selectedAisMmsi);
	}

	function collapseAttribution(): void {
		if (!container) {
			return;
		}
		container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
	}

	function addApplicationLayers(): void {
		if (!map) return;
		buildApplicationLayers({
			map,
			snapshot,
			mode,
			offlineMap,
			depthContoursEnabled,
			pointFeatures: featureCollection('points'),
			lineFeatures: featureCollection('lines'),
			actualRoutes,
			aisFeatures: selectedAisFeatures(),
			markerImages
		});
		locationController.refreshSource();
		requestAnimationFrame(collapseAttribution);
		map.once('render', (): void => {
			mapReady = true;
			collapseAttribution();
		});
		map.triggerRepaint();
	}

	async function applyMapStyle(
		selectedMode: MapMode,
		storedMap: OfflineMapRecord | undefined
	): Promise<void> {
		const request = ++styleRequest;
		const style = await mapStyle(selectedMode, storedMap, protocol);
		if (request === styleRequest) {
			mapReady = false;
			map?.setStyle(style);
		}
	}

	$effect((): void => {
		const points = featureCollection('points');
		const lines = featureCollection('lines');
		const routes = { type: 'FeatureCollection' as const, features: actualRoutes };
		if (map) ensureMapMarkerImages(map, snapshot);
		const pointSource = map?.getSource('points');
		const lineSource = map?.getSource('lines');
		const routeSource = map?.getSource('actual-routes');
		const aisSource = map?.getSource('ais-vessels');
		if (isGeoJsonSource(pointSource)) {
			pointSource.setData(points);
		}
		if (isGeoJsonSource(lineSource)) {
			lineSource.setData(lines);
		}
		if (isGeoJsonSource(routeSource)) {
			routeSource.setData(routes);
		}
		if (isGeoJsonSource(aisSource)) {
			aisSource.setData(selectedAisFeatures());
		}
	});

	$effect(() => {
		const feature =
			selectedFeature ?? snapshot.features.find((candidate) => candidate.id === selectedId);
		if (feature?.geometry.type === 'Point') {
			if (!map) return;
			const coordinates = feature.geometry.coordinates;
			const selectionId = feature.id;
			selectedPoint = coordinates;
			return focusSelectedPoint({
				map,
				container,
				coordinates,
				isSelected: () => (selectedFeature?.id ?? selectedId) === selectionId
			});
		}
		if (selectedPoint && map) {
			const point = selectedPoint;
			selectedPoint = undefined;
			map.easeTo({ center: point });
		}
	});

	$effect((): void => {
		const selectedMode = mode;
		const storedMap = offlineMap;
		if (map) {
			void applyMapStyle(selectedMode, storedMap);
		}
	});

	onMount(() => {
		let disposed = false;
		void (async (): Promise<void> => {
			const [maplibre, loadedMarkerImages] = await Promise.all([
				import('maplibre-gl'),
				loadMapMarkerImages()
			]);
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (disposed) {
				return;
			}
			markerImages = loadedMarkerImages;
			maplibre.setWorkerUrl(maplibreWorkerUrl);
			maplibre.addProtocol('pmtiles', protocol.tile);
			const style = await mapStyle(mode, offlineMap, protocol);
			if (disposed) {
				maplibre.removeProtocol('pmtiles');
				return;
			}
			const camera = loadMapCamera(sessionStorage, cameraStorageKey);
			cameraChanged = camera !== undefined;
			bearing = camera?.bearing ?? 0;
			map = new maplibre.Map({
				container,
				style,
				...(camera
					? {
							center: camera.center,
							zoom: camera.zoom,
							bearing: camera.bearing,
							pitch: camera.pitch
						}
					: { bounds: snapshot.bounds, fitBoundsOptions: { padding: 40 } }),
				attributionControl: { compact: true }
			});
			map.on('style.load', addApplicationLayers);
			map.once('load', (): void => {
				collapseAttribution();
				map?.on('moveend', (): void => {
					saveCamera();
				});
			});
			registerMapInteractions(map, {
				onSelectFeature: onselect,
				onSelectAis: onselectais,
				onSelectRestaurant: onselectopenfreemap,
				onUserPan: (): void => locationController.stopFollowing(),
				onRotate: updateBearing
			});
		})();
		return (): void => {
			disposed = true;
			locationController.dispose();
			map?.remove();
			void import('maplibre-gl').then((maplibre) => maplibre.removeProtocol('pmtiles'));
		};
	});
</script>

<div
	class="relative size-full overflow-hidden bg-base-200"
	data-map-ready={mapReady}
	data-actual-route-count={actualRoutes.length}
	data-actual-route-ids={actualRoutes.map((route) => route.properties.gpxId).join(',')}
	data-hidden-route-count={hiddenRouteIds.size}
	data-position-marker="monsieur-bintang"
	data-position-heading={vesselHeading}
	data-position-speed-knots={vesselSpeedKnots?.toFixed(1) ?? ''}
	data-ais-vessel-count={aisVessels.length}
	data-selected-ais-mmsi={selectedAisMmsi ?? ''}
>
	<div bind:this={container} class="size-full" aria-label="Reisekart"></div>
	<div class="absolute right-3 bottom-12 z-20 flex flex-col items-end gap-2">
		{#if locationMessage}
			<p class="max-w-64 rounded bg-base-100 px-3 py-2 text-sm shadow" role="status">
				{locationMessage}
			</p>
		{/if}
		{#if Math.abs(bearing) >= 0.5}
			<button
				class="btn btn-circle bg-base-100 shadow"
				type="button"
				onclick={resetBearing}
				aria-label="Tilbakestill kartretning mot nord"
				title="Tilbakestill kartretning mot nord"
			>
				<span
					class="grid place-items-center text-error transition-transform"
					style:transform={`rotate(${-bearing}deg)`}
				>
					<Navigation2 size={20} />
				</span>
			</button>
		{/if}
		{#if cameraChanged}
			<button
				class="btn btn-circle bg-base-100 shadow"
				type="button"
				onclick={resetCamera}
				aria-label="Tilbakestill kartutsnitt"
				title="Tilbakestill kartutsnitt"
			>
				<Maximize size={20} />
			</button>
		{/if}
		<button
			class="btn btn-circle shadow"
			class:btn-primary={following}
			class:bg-base-100={!following}
			type="button"
			onclick={locate}
			aria-label={following ? 'Følger posisjonen din' : 'Finn posisjonen min'}
			title={following ? 'Følger posisjonen din' : 'Finn posisjonen min'}
		>
			{#if following}<Navigation size={20} />{:else}<LocateFixed size={20} />{/if}
		</button>
		{#if vesselSpeedKnots !== undefined}
			<div
				class="flex items-center gap-2 rounded-full border border-base-300 bg-base-100/95 py-1.5 pr-3 pl-1.5 shadow-lg backdrop-blur-sm"
				data-vessel-telemetry
				aria-label={`Fart ${vesselSpeedLabel} knop, kurs ${Math.round(vesselHeading)} grader`}
			>
				<span class="grid size-8 place-items-center rounded-full bg-primary text-primary-content">
					<span class="grid place-items-center" style:transform={`rotate(${vesselHeading}deg)`}>
						<Navigation2 size={16} strokeWidth={2.5} />
					</span>
				</span>
				<span class="flex items-baseline gap-1 font-semibold tabular-nums">
					<span class="text-base leading-none text-neutral">{vesselSpeedLabel}</span>
					<span class="text-xs text-base-content/55">kn</span>
				</span>
				<span class="h-4 w-px bg-base-300" aria-hidden="true"></span>
				<span class="font-mono text-sm font-semibold text-neutral tabular-nums">
					{vesselHeadingLabel}
				</span>
			</div>
		{/if}
	</div>
</div>
