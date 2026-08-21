<script lang="ts">
	import { LocateFixed, Navigation, Navigation2 } from '@lucide/svelte';
	import { layers, namedFlavor } from '@protomaps/basemaps';
	import {
		Anchor,
		Binoculars,
		LifeBuoy,
		Martini,
		Sailboat,
		ShoppingBasket,
		UtensilsCrossed
	} from 'lucide';
	import type {
		GeoJSONSource,
		Map as MapLibreMap,
		MapGeoJSONFeature,
		Source,
		StyleSpecification
	} from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { FileSource, PMTiles, Protocol, TileType } from 'pmtiles';
	import { onMount } from 'svelte';

	import type { OfflineMapRecord } from '$lib/client/database';
	import type { ActualRouteFeature } from '$lib/map/trip-routes';

	import type { MapFeature, MapMode, MapPointSymbol, MapSnapshot, Position } from './types';

	let {
		snapshot,
		visibleLayerIds,
		visibleSourceStyleKeys,
		selectedId,
		mode,
		offlineMap,
		actualRoutes,
		hiddenRouteIds,
		onselect
	}: {
		snapshot: MapSnapshot;
		visibleLayerIds: Set<string>;
		visibleSourceStyleKeys: Set<string>;
		selectedId: string | undefined;
		mode: MapMode;
		offlineMap: OfflineMapRecord | undefined;
		actualRoutes: ActualRouteFeature[];
		hiddenRouteIds: Set<string>;
		onselect: (id: string) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let locationState = $state<'idle' | 'locating' | 'active' | 'denied' | 'timeout' | 'unavailable'>(
		'idle'
	);
	let following = $state(false);
	let bearing = $state(0);
	let mapReady = $state(false);
	let watchId: number | undefined;
	let lastPosition: GeolocationPosition | undefined;
	let styleRequest = 0;
	let harbourRequest = 0;
	let positionMarkerImage: ImageData | undefined;
	const protocol = new Protocol({ metadata: true });

	function isGeoJsonSource(source: Source | undefined): source is GeoJSONSource {
		return source !== undefined && 'setData' in source;
	}

	const markerIcons: Record<MapPointSymbol, typeof Anchor> = {
		anchorage: Anchor,
		bar: Martini,
		'buoy-field': LifeBuoy,
		marina: Sailboat,
		restaurant: UtensilsCrossed,
		shop: ShoppingBasket,
		poi: Binoculars
	};

	function drawMarkerIcon(context: CanvasRenderingContext2D, symbol: MapPointSymbol): void {
		context.save();
		context.translate(26, 20);
		context.scale(1.15, 1.15);
		context.strokeStyle = '#17343c';
		context.lineWidth = 2.4;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		for (const [tag, attributes] of markerIcons[symbol] ?? Binoculars) {
			if (tag === 'path' && typeof attributes.d === 'string') {
				context.stroke(new Path2D(attributes.d));
			}
			if (tag === 'circle') {
				context.beginPath();
				context.arc(
					Number(attributes.cx),
					Number(attributes.cy),
					Number(attributes.r),
					0,
					Math.PI * 2
				);
				context.stroke();
			}
		}
		context.restore();
	}

	function pinImage(color: string, symbol: MapPointSymbol, selected: boolean): ImageData {
		const canvas = document.createElement('canvas');
		canvas.width = 80;
		canvas.height = 96;
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('CANVAS_UNAVAILABLE');
		}
		context.beginPath();
		context.moveTo(40, 90);
		context.bezierCurveTo(34, 76, 12, 55, 12, 34);
		context.arc(40, 34, 28, Math.PI, 0);
		context.bezierCurveTo(68, 55, 46, 76, 40, 90);
		context.closePath();
		context.lineJoin = 'round';
		if (selected) {
			context.strokeStyle = '#123844';
			context.lineWidth = 13;
			context.stroke();
			context.strokeStyle = '#ffffff';
			context.lineWidth = 8;
			context.stroke();
		}
		context.fillStyle = color;
		context.fill();
		context.strokeStyle = '#ffffff';
		context.lineWidth = 4;
		context.stroke();
		context.beginPath();
		context.arc(40, 34, 18, 0, Math.PI * 2);
		context.fillStyle = '#ffffff';
		context.fill();
		drawMarkerIcon(context, symbol);
		return context.getImageData(0, 0, canvas.width, canvas.height);
	}

	async function loadPositionMarkerImage(): Promise<ImageData> {
		const response = await fetch('/monsieur-bintang.png');
		if (!response.ok) {
			throw new Error('POSITION_MARKER_UNAVAILABLE');
		}
		const bitmap = await createImageBitmap(await response.blob());
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const context = canvas.getContext('2d');
		if (!context) {
			bitmap.close();
			throw new Error('CANVAS_UNAVAILABLE');
		}
		const scale = Math.min(112 / bitmap.width, 112 / bitmap.height);
		const width = bitmap.width * scale;
		const height = bitmap.height * scale;
		context.drawImage(bitmap, (128 - width) / 2, (128 - height) / 2, width, height);
		bitmap.close();
		return context.getImageData(0, 0, canvas.width, canvas.height);
	}

	const locationMessage = $derived(
		locationState === 'locating'
			? 'Finner posisjonen din …'
			: locationState === 'denied'
				? 'Du har ikke gitt tilgang til posisjonen din.'
				: locationState === 'timeout'
					? 'Det tok for lang tid å finne posisjonen.'
					: locationState === 'unavailable'
						? 'Posisjonen er ikke tilgjengelig.'
						: ''
	);

	function circle(center: Position, radius: number): Position[] {
		const latitudeRadians = (center[1] * Math.PI) / 180;
		return Array.from({ length: 65 }, (_value, index): Position => {
			const angle = (index / 64) * Math.PI * 2;
			const latitude = center[1] + (radius / 111_320) * Math.sin(angle);
			const longitude =
				center[0] + (radius / (111_320 * Math.cos(latitudeRadians))) * Math.cos(angle);
			return [longitude, latitude];
		});
	}

	function updateLocation(position: GeolocationPosition): void {
		lastPosition = position;
		locationState = 'active';
		const coordinates: Position = [position.coords.longitude, position.coords.latitude];
		const source = map?.getSource('location');
		if (isGeoJsonSource(source)) {
			source.setData({
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						properties: { kind: 'accuracy' },
						geometry: {
							type: 'Polygon',
							coordinates: [circle(coordinates, position.coords.accuracy)]
						}
					},
					{
						type: 'Feature',
						properties: { kind: 'position', heading: position.coords.heading ?? 0 },
						geometry: { type: 'Point', coordinates }
					}
				]
			});
		}
		if (following) {
			map?.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 14) });
		}
	}

	function locationError(error: GeolocationPositionError): void {
		following = false;
		locationState = error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable';
	}

	function locate(): void {
		if (!navigator.geolocation) {
			locationState = 'unavailable';
			return;
		}
		following = true;
		if (lastPosition) {
			updateLocation(lastPosition);
			return;
		}
		locationState = 'locating';
		watchId = navigator.geolocation.watchPosition(updateLocation, locationError, {
			enableHighAccuracy: true,
			timeout: 15_000,
			maximumAge: 5_000
		});
	}

	function updateBearing(): void {
		bearing = map?.getBearing() ?? 0;
	}

	function resetBearing(): void {
		map?.resetNorth({ duration: 300 });
	}

	function featureCollection(kind: 'points' | 'lines'): {
		type: 'FeatureCollection';
		features: MapFeature[];
	} {
		return {
			type: 'FeatureCollection',
			features: snapshot.features
				.filter((feature) => kind !== 'lines' || !hiddenRouteIds.has(feature.id))
				.filter(
					(feature) => visibleLayerIds.size === 0 || visibleLayerIds.has(feature.properties.layerId)
				)
				.filter(
					(feature) =>
						feature.geometry.type !== 'Point' ||
						feature.properties.sourceStyleKey === undefined ||
						visibleSourceStyleKeys.size === 0 ||
						visibleSourceStyleKeys.has(feature.properties.sourceStyleKey)
				)
				.filter((feature) =>
					kind === 'points' ? feature.geometry.type === 'Point' : feature.geometry.type !== 'Point'
				)
				.map((feature) => ({
					...feature,
					properties: {
						...feature.properties,
						featureId: feature.id,
						sourceStyleKey: feature.properties.sourceStyleKey ?? 'source-style-default',
						color:
							feature.properties.style.color ??
							snapshot.layers.find((layer) => layer.id === feature.properties.layerId)?.color ??
							'#0f766e',
						selected: feature.id === selectedId
					}
				}))
		};
	}

	function ensureMarkerImages(): void {
		if (!map) {
			return;
		}
		if (!map.hasImage('source-style-default')) {
			map.addImage('source-style-default', pinImage('#5f6b6d', 'poi', false), {
				pixelRatio: 2
			});
			map.addImage('source-style-default-selected', pinImage('#5f6b6d', 'poi', true), {
				pixelRatio: 2
			});
		}
		for (const sourceStyle of snapshot.sourceStyles) {
			if (map.hasImage(sourceStyle.key)) {
				continue;
			}
			map.addImage(sourceStyle.key, pinImage(sourceStyle.color, sourceStyle.symbol, false), {
				pixelRatio: 2
			});
			map.addImage(
				`${sourceStyle.key}-selected`,
				pinImage(sourceStyle.color, sourceStyle.symbol, true),
				{ pixelRatio: 2 }
			);
		}
	}

	function collapseAttribution(): void {
		if (!container) {
			return;
		}
		container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
	}

	async function updateHarbours(): Promise<void> {
		const source = map?.getSource('harbours');
		if (!map || !isGeoJsonSource(source)) {
			return;
		}
		const request = ++harbourRequest;
		const bounds = map.getBounds();
		const params = new URLSearchParams({
			west: bounds.getWest().toFixed(5),
			south: bounds.getSouth().toFixed(5),
			east: bounds.getEast().toFixed(5),
			north: bounds.getNorth().toFixed(5),
			zoom: String(Math.round(map.getZoom()))
		});
		try {
			const response = await fetch(`/api/map/harbours?${params}`);
			if (!response.ok || request !== harbourRequest) {
				return;
			}
			source.setData((await response.json()) as GeoJSON.FeatureCollection);
		} catch {
			return;
		}
	}

	function satelliteStyle(): StyleSpecification {
		return {
			version: 8,
			sources: {
				satellite: {
					type: 'raster',
					tiles: [
						'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
					],
					tileSize: 256,
					maxzoom: 18,
					attribution:
						'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community'
				},
				satelliteLabels: {
					type: 'raster',
					tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/overlay_3857/default/g/{z}/{y}/{x}.png'],
					tileSize: 256,
					maxzoom: 14,
					attribution:
						'Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Rendering © EOX'
				}
			},
			layers: [
				{ id: 'satellite', type: 'raster', source: 'satellite' },
				{
					id: 'satellite-labels',
					type: 'raster',
					source: 'satelliteLabels',
					maxzoom: 15
				}
			]
		};
	}

	async function offlineStyle(record: OfflineMapRecord): Promise<StyleSpecification> {
		const file = new File([record.data], `${record.id}-${record.version}.pmtiles`, {
			type: 'application/vnd.pmtiles'
		});
		const source = new FileSource(file);
		const archive = new PMTiles(source);
		const header = await archive.getHeader();
		protocol.add(archive);
		const url = `pmtiles://${source.getKey()}`;
		if (header.tileType === TileType.Mvt) {
			return {
				version: 8,
				sources: {
					offlineBase: {
						type: 'vector',
						url,
						attribution:
							'<a href="https://protomaps.com/">Protomaps</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					}
				},
				layers: layers('offlineBase', namedFlavor('light')).filter(
					(layer) => layer.type !== 'symbol'
				)
			};
		}
		if (
			header.tileType !== TileType.Png &&
			header.tileType !== TileType.Jpeg &&
			header.tileType !== TileType.Webp &&
			header.tileType !== TileType.Avif
		) {
			throw new Error('OFFLINE_MAP_TILE_TYPE_UNSUPPORTED');
		}
		return {
			version: 8,
			sources: {
				offlineBase: {
					type: 'raster',
					url,
					tileSize: 256
				}
			},
			layers: [{ id: 'offline-base', type: 'raster', source: 'offlineBase' }]
		};
	}

	async function mapStyle(
		selectedMode: MapMode,
		storedMap: OfflineMapRecord | undefined
	): Promise<string | StyleSpecification> {
		if (storedMap) {
			return offlineStyle(storedMap);
		}
		return selectedMode === 'satellite'
			? satelliteStyle()
			: 'https://tiles.openfreemap.org/styles/bright?v=20260820';
	}

	function addApplicationLayers(): void {
		if (!map) {
			return;
		}
		ensureMarkerImages();
		if (positionMarkerImage && !map.hasImage('position-duck')) {
			map.addImage('position-duck', positionMarkerImage, { pixelRatio: 2 });
		}
		if (mode === 'nautical' && !offlineMap) {
			map.addSource('marine-profile', {
				type: 'raster',
				tiles: ['/api/map/marine-profile/{z}/{x}/{y}'],
				tileSize: 256,
				maxzoom: 18,
				attribution:
					'<a href="https://www.openseamap.org/">OpenSeaMap</a> / <a href="https://www.gebco.net/">GEBCO</a>, ODbL'
			});
			map.addSource('seamarks', {
				type: 'raster',
				tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
				tileSize: 256,
				attribution:
					'<a href="https://www.openseamap.org/">OpenSeaMap</a> contributors, ODbL / CC BY-SA 2.0'
			});
			map.addSource('depth-contours', {
				type: 'raster',
				tiles: ['/api/map/depth-contours/{z}/{x}/{y}'],
				tileSize: 256,
				maxzoom: 18,
				attribution:
					'<a href="https://depth.openseamap.org/">OpenSeaMap water depths</a> contributors'
			});
			map.addSource('harbours', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
				attribution: '<a href="https://www.openseamap.org/">OpenSeaMap</a> harbours'
			});
			map.addLayer({
				id: 'marine-profile',
				type: 'raster',
				source: 'marine-profile',
				paint: { 'raster-opacity': 0.7 }
			});
			map.addLayer({
				id: 'depth-contours',
				type: 'raster',
				source: 'depth-contours',
				minzoom: 7,
				paint: { 'raster-opacity': 0.9 }
			});
			map.addLayer({
				id: 'seamarks',
				type: 'raster',
				source: 'seamarks',
				minzoom: 8,
				paint: { 'raster-opacity': 0.9 }
			});
			map.addLayer({
				id: 'harbours',
				type: 'circle',
				source: 'harbours',
				minzoom: 7,
				paint: {
					'circle-color': '#2563a8',
					'circle-radius': 6,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 2
				}
			});
			void updateHarbours();
		}
		map.addSource('points', {
			type: 'geojson',
			data: featureCollection('points'),
			cluster: true,
			clusterMaxZoom: 10,
			clusterRadius: 28
		});
		map.addSource('lines', { type: 'geojson', data: featureCollection('lines') });
		map.addSource('actual-routes', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: actualRoutes }
		});
		map.addSource('location', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
		map.addLayer({
			id: 'routes',
			type: 'line',
			source: 'lines',
			paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 }
		});
		map.addLayer({
			id: 'actual-route-casing',
			type: 'line',
			source: 'actual-routes',
			paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.38 }
		});
		map.addLayer({
			id: 'actual-routes',
			type: 'line',
			source: 'actual-routes',
			paint: {
				'line-color': '#3f7278',
				'line-width': 2,
				'line-opacity': 0.72,
				'line-dasharray': [1.5, 2.5]
			}
		});
		map.addLayer({
			id: 'clusters',
			type: 'circle',
			source: 'points',
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': '#153e4b',
				'circle-radius': ['step', ['get', 'point_count'], 18, 20, 23, 50, 28],
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 2
			}
		});
		if (!offlineMap) {
			map.addLayer({
				id: 'cluster-count',
				type: 'symbol',
				source: 'points',
				filter: ['has', 'point_count'],
				layout: {
					'text-field': ['get', 'point_count_abbreviated'],
					'text-font': ['Noto Sans Regular'],
					'text-size': 12
				},
				paint: { 'text-color': '#ffffff' }
			});
		}
		map.addLayer({
			id: 'point-hit-targets',
			type: 'circle',
			source: 'points',
			filter: ['!', ['has', 'point_count']],
			paint: {
				'circle-color': '#000000',
				'circle-opacity': 0.01,
				'circle-radius': 22,
				'circle-translate': [0, -18]
			}
		});
		map.addLayer({
			id: 'points',
			type: 'symbol',
			source: 'points',
			filter: ['!', ['has', 'point_count']],
			layout: {
				'icon-image': [
					'case',
					['get', 'selected'],
					['concat', ['get', 'sourceStyleKey'], '-selected'],
					['get', 'sourceStyleKey']
				],
				'icon-anchor': 'bottom',
				'icon-allow-overlap': true
			}
		});
		map.addLayer({
			id: 'accuracy',
			type: 'fill',
			source: 'location',
			filter: ['==', ['get', 'kind'], 'accuracy'],
			paint: { 'fill-color': '#2563a8', 'fill-opacity': 0.14 }
		});
		map.addLayer({
			id: 'position',
			type: 'symbol',
			source: 'location',
			metadata: { marker: 'monsieur-bintang' },
			filter: ['==', ['get', 'kind'], 'position'],
			layout: {
				'icon-image': 'position-duck',
				'icon-allow-overlap': true
			}
		});
		if (lastPosition) {
			updateLocation(lastPosition);
		}
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
		const style = await mapStyle(selectedMode, storedMap);
		if (request === styleRequest) {
			mapReady = false;
			map?.setStyle(style);
		}
	}

	$effect((): void => {
		const points = featureCollection('points');
		const lines = featureCollection('lines');
		const routes = { type: 'FeatureCollection' as const, features: actualRoutes };
		ensureMarkerImages();
		const pointSource = map?.getSource('points');
		const lineSource = map?.getSource('lines');
		const routeSource = map?.getSource('actual-routes');
		if (isGeoJsonSource(pointSource)) {
			pointSource.setData(points);
		}
		if (isGeoJsonSource(lineSource)) {
			lineSource.setData(lines);
		}
		if (isGeoJsonSource(routeSource)) {
			routeSource.setData(routes);
		}
	});

	$effect((): void => {
		const feature = snapshot.features.find((candidate) => candidate.id === selectedId);
		if (feature?.geometry.type === 'Point') {
			map?.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 13) });
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
			const [maplibre, markerImage] = await Promise.all([
				import('maplibre-gl'),
				loadPositionMarkerImage()
			]);
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (disposed) {
				return;
			}
			positionMarkerImage = markerImage;
			maplibre.setWorkerUrl(maplibreWorkerUrl);
			maplibre.addProtocol('pmtiles', protocol.tile);
			const style = await mapStyle(mode, offlineMap);
			if (disposed) {
				maplibre.removeProtocol('pmtiles');
				return;
			}
			map = new maplibre.Map({
				container,
				style,
				bounds: snapshot.bounds,
				fitBoundsOptions: { padding: 40 },
				attributionControl: { compact: true }
			});
			map.on('style.load', addApplicationLayers);
			map.once('load', collapseAttribution);
			const selectPoint = (event: { features?: MapGeoJSONFeature[] }): void => {
				const id = event.features?.[0]?.properties.featureId;
				if (typeof id === 'string') {
					onselect(id);
				}
			};
			map.on('click', 'points', selectPoint);
			map.on('click', 'point-hit-targets', selectPoint);
			map.on('click', 'clusters', (event): void => {
				const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
				const clusterId = feature?.properties.cluster_id;
				const source = map?.getSource('points');
				if (
					!isGeoJsonSource(source) ||
					typeof clusterId !== 'number' ||
					feature?.geometry.type !== 'Point'
				) {
					return;
				}
				const center: Position = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
				void source
					.getClusterExpansionZoom(clusterId)
					.then((zoom) => map?.easeTo({ center, zoom }));
			});
			map.on('dragstart', (): void => {
				following = false;
			});
			map.on('rotate', updateBearing);
			map.on('moveend', updateHarbours);
		})();
		return (): void => {
			disposed = true;
			if (watchId !== undefined) {
				navigator.geolocation.clearWatch(watchId);
			}
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
		<button
			class="btn btn-circle bg-base-100 shadow"
			class:btn-primary={following}
			type="button"
			onclick={locate}
			aria-label={following ? 'Følger posisjonen din' : 'Finn posisjonen min'}
			title={following ? 'Følger posisjonen din' : 'Finn posisjonen min'}
		>
			{#if following}<Navigation size={20} />{:else}<LocateFixed size={20} />{/if}
		</button>
	</div>
</div>
