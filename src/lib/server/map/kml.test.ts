import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { parseKml } from './kml';

const fixture = readFileSync(resolve('tests/fixtures/google-map.kml'), 'utf8');
const googleIconHref = 'https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png';
const layerNames = [
	'Anker, bøye og marina',
	'Dag 1 - Lørdag',
	'Dag 2 og 3 - Søndag og Mandag - Hvar Vest',
	'Dag 4 og 5 - Tirsdag og Onsdag - Vis',
	'Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo',
	'Dag 8 og 9 - Lørdag og Søndag',
	'Dag 10 og 11 - Mandag og Tirsdag',
	'Dag 12 og 13 - Onsdag og Torsdag',
	'Dag 14 - Fredag'
];

describe('KML parser', (): void => {
	test('parses the real Google My Maps fixture', (): void => {
		const snapshot = parseKml(fixture, '2026-08-20T00:00:00.000Z');
		const points = snapshot.features.filter((feature) => feature.geometry.type === 'Point');
		const lines = snapshot.features.filter((feature) => feature.geometry.type === 'LineString');
		const withExtendedData = snapshot.features.filter(
			(feature) => Object.keys(feature.properties.extendedData).length > 0
		);
		const blueLagoon = snapshot.features.find(
			(feature) => feature.properties.title === '4 Blue lagoon anchorage'
		);
		const boatBar = snapshot.features.find(
			(feature) => feature.properties.title === 'Båt med bar :)'
		);

		expect(snapshot.title).toBe('Croatia seiltur! V2');
		expect(snapshot.version).toBe(1);
		expect(snapshot.sourceHash).toBe(
			'92abaf1dbbe4914fdfc5c71caa66e8977810d27bdd9fc902e6cfe22196f32d0d'
		);
		expect(snapshot.layers.map((layer) => layer.name)).toEqual(layerNames);
		expect(snapshot.sourceStyles).toMatchObject([
			{
				color: '#087f8c',
				iconHref: googleIconHref,
				iconCode: '1623',
				symbol: 'anchorage',
				label: 'Ankerplasser og fortøyninger',
				count: 63
			},
			{
				color: '#9a5b3f',
				iconHref: googleIconHref,
				iconCode: '1577',
				symbol: 'restaurant',
				label: 'Restauranter',
				count: 31
			},
			{
				color: '#2563a8',
				iconHref: googleIconHref,
				iconCode: '1681',
				symbol: 'marina',
				label: 'Marinaer og havner',
				count: 28
			},
			{
				color: '#d64545',
				iconHref: googleIconHref,
				iconCode: '1563',
				symbol: 'buoy-field',
				label: 'Bøyefelt',
				count: 13
			},
			{
				color: '#39724d',
				iconHref: googleIconHref,
				iconCode: '1685',
				symbol: 'shop',
				label: 'Butikker og forsyninger',
				count: 3
			},
			{
				color: '#d15f45',
				iconHref: googleIconHref,
				iconCode: '1517',
				symbol: 'bar',
				label: 'Barer',
				count: 3
			}
		]);
		expect(snapshot.sourceStyles).toHaveLength(6);
		expect(snapshot.sourceStyles.reduce((total, style) => total + style.count, 0)).toBe(141);
		expect(
			points.every((feature) =>
				snapshot.sourceStyles.some((style) => style.key === feature.properties.sourceStyleKey)
			)
		).toBe(true);
		expect(snapshot.features).toHaveLength(150);
		expect(points).toHaveLength(141);
		expect(lines).toHaveLength(9);
		expect(withExtendedData).toHaveLength(141);
		expect(snapshot.bounds[0]).toBeLessThan(snapshot.bounds[2]);
		expect(snapshot.bounds[1]).toBeLessThan(snapshot.bounds[3]);
		expect(snapshot.features[0]?.properties.style.color).toBe('#f57c00');
		expect(snapshot.layers[0]?.color).toBe('#f57c00');
		expect(snapshot.layers.every((layer) => /^#[0-9a-f]{6}$/.test(layer.color))).toBe(true);
		expect(snapshot.features.every((feature) => /^[0-9a-f]{64}$/.test(feature.id))).toBe(true);
		expect(blueLagoon?.properties.description).toContain('Coordinates: 43.4388 N, 16.17353 E');
		expect(blueLagoon?.properties.description).not.toContain('naziv:');
		expect(blueLagoon?.properties.description).not.toContain('opis:');
		expect(boatBar?.properties.description).toBe('');
		expect(boatBar?.properties.extendedData).toEqual({
			description: '',
			naziv: 'Båt med bar :)',
			opis: ''
		});
		expect(parseKml(fixture).features.map((feature) => feature.id)).toEqual(
			snapshot.features.map((feature) => feature.id)
		);
	});

	test('sanitizes unsafe rich content and supports MultiGeometry', (): void => {
		const snapshot = parseKml(`<?xml version="1.0"?>
			<kml><Document><name>Test</name><Folder><name>Layer</name><Placemark>
			<name>Safe</name><description><![CDATA[<p onclick="bad()">Text <strong>bold</strong></p><script>alert(1)</script><a href="http://bad.test">bad</a><a href="https://good.test">good</a>]]></description>
			<ExtendedData><Data name="note"><value><![CDATA[<em>Value</em><iframe src="https://bad.test"></iframe>]]></value></Data></ExtendedData>
			<MultiGeometry><Point><coordinates>16.1,43.1,0</coordinates></Point><LineString><coordinates>16.1,43.1 16.2,43.2</coordinates></LineString></MultiGeometry>
			</Placemark></Folder></Document></kml>`);
		const feature = snapshot.features[0];

		expect(feature?.geometry.type).toBe('GeometryCollection');
		expect(feature?.properties.description).toBe(
			'<p>Text <strong>bold</strong></p><a>bad</a><a href="https://good.test">good</a>'
		);
		expect(feature?.properties.extendedData).toEqual({ note: '<em>Value</em>' });
		expect(snapshot.sourceStyles).toEqual([]);
	});

	test('uses a conservative fallback for an unknown point style', (): void => {
		const snapshot = parseKml(`<?xml version="1.0"?>
			<kml><Document><Style id="unknown"><IconStyle><color>ff332211</color><Icon><href>https://example.com/pin.png</href></Icon></IconStyle></Style><Folder><name>Layer</name><Placemark>
			<name>Unknown</name><styleUrl>#unknown</styleUrl><Point><coordinates>16.1,43.1</coordinates></Point>
			</Placemark></Folder></Document></kml>`);

		expect(snapshot.sourceStyles).toMatchObject([
			{
				color: '#5f6b6d',
				iconHref: 'https://example.com/pin.png',
				iconCode: '',
				symbol: 'poi',
				label: 'Andre steder',
				count: 1
			}
		]);
	});

	test.each([
		['1502', 'poi', 'Interessepunkter'],
		['1517', 'bar', 'Barer'],
		['1577', 'restaurant', 'Restauranter']
	])('maps Google icon %s to %s', (iconCode, symbol, label): void => {
		const snapshot = parseKml(`<?xml version="1.0"?>
			<kml><Document><Style id="icon-${iconCode}-FFFFFF"><IconStyle><Icon><href>${googleIconHref}</href></Icon></IconStyle></Style><Folder><name>Layer</name><Placemark>
			<name>Place</name><styleUrl>#icon-${iconCode}-FFFFFF</styleUrl><Point><coordinates>16.1,43.1</coordinates></Point>
			</Placemark></Folder></Document></kml>`);

		expect(snapshot.sourceStyles[0]).toMatchObject({ iconCode, symbol, label });
	});

	test.each([
		['malformed XML', '<kml><Document>'],
		['missing document', '<kml></kml>'],
		['empty document', '<kml><Document><name>Empty</name></Document></kml>'],
		[
			'invalid coordinates',
			'<kml><Document><Folder><Placemark><Point><coordinates>999,999</coordinates></Point></Placemark></Folder></Document></kml>'
		]
	])('rejects %s', (_name, input): void => {
		expect(() => parseKml(input)).toThrow();
	});
});
