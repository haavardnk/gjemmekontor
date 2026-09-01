import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { FileSource, PMTiles, type Protocol, TileType } from 'pmtiles';

import type { MapMode } from '../domain/types';
import type { OfflineMapRecord } from './offline';

const onlineStyle = 'https://tiles.openfreemap.org/styles/bright?v=20260820';

export function satelliteStyle(): StyleSpecification {
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
			{ id: 'satellite-labels', type: 'raster', source: 'satelliteLabels', maxzoom: 15 }
		]
	};
}

async function offlineStyle(
	record: OfflineMapRecord,
	protocol: Pick<Protocol, 'add'>
): Promise<StyleSpecification> {
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
			layers: layers('offlineBase', namedFlavor('light')).filter((layer) => layer.type !== 'symbol')
		};
	}
	if (![TileType.Png, TileType.Jpeg, TileType.Webp, TileType.Avif].includes(header.tileType)) {
		throw new Error('OFFLINE_MAP_TILE_TYPE_UNSUPPORTED');
	}
	return {
		version: 8,
		sources: { offlineBase: { type: 'raster', url, tileSize: 256 } },
		layers: [{ id: 'offline-base', type: 'raster', source: 'offlineBase' }]
	};
}

export async function mapStyle(
	mode: MapMode,
	offlineMap: OfflineMapRecord | undefined,
	protocol: Pick<Protocol, 'add'>
): Promise<string | StyleSpecification> {
	if (offlineMap) return offlineStyle(offlineMap, protocol);
	return mode === 'satellite' ? satelliteStyle() : onlineStyle;
}
