import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

const googleIconHref = 'https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png';
const anchorageStyleKey = 'source-style-anchorage';
const marinaStyleKey = 'source-style-marina';
const sourceMapId = 'test-map';
const sourceUrl = `https://www.google.com/maps/d/viewer?mid=${sourceMapId}`;
const transparentPng = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2W4WAAAAAElFTkSuQmCC',
	'base64'
);
const openFreeMapVectorTile = readFileSync(resolve('tests/fixtures/openfreemap-vector-tile.pbf'));

const layerOne = {
	id: 'layer-one',
	name: 'Anker, bøye og marina',
	path: ['Anker, bøye og marina'],
	color: '#0f766e',
	featureCount: 2,
	pointCount: 2,
	lineCount: 0
};

const layerTwo = {
	id: 'layer-two',
	name: 'Dag 1 - Lørdag',
	path: ['Dag 1 - Lørdag'],
	color: '#dc6b3f',
	featureCount: 1,
	pointCount: 0,
	lineCount: 1
};

const snapshot = {
	version: 1,
	type: 'FeatureCollection',
	title: 'Croatia seiltur! V2',
	description: 'Seiltur',
	fetchedAt: '2026-08-20T10:00:00.000Z',
	sourceHash: 'fixture',
	bounds: [16.1, 43.1, 16.4, 43.4],
	layers: [layerOne, layerTwo],
	sourceStyles: [
		{
			key: anchorageStyleKey,
			color: '#087f8c',
			iconHref: googleIconHref,
			iconCode: '1623',
			symbol: 'anchorage',
			label: 'Ankerplasser og fortøyninger',
			count: 1
		},
		{
			key: marinaStyleKey,
			color: '#2563a8',
			iconHref: googleIconHref,
			iconCode: '1681',
			symbol: 'marina',
			label: 'Marinaer og havner',
			count: 1
		}
	],
	features: [
		{
			type: 'Feature',
			id: 'poi-one',
			geometry: { type: 'Point', coordinates: [16.25, 43.25] },
			properties: {
				title: 'Stiniva-bukten',
				description: '<p>En smal bukt med klart vann.</p>',
				snippet: '',
				address: 'Vis, Kroatia',
				layerId: layerOne.id,
				layerName: layerOne.name,
				layerPath: layerOne.path,
				extendedData: {
					Dybde: '8–12 meter',
					naziv: 'Stiniva-bukten',
					opis: 'En smal bukt med klart vann.'
				},
				style: { color: '#f57c00', iconHref: googleIconHref },
				sourceStyleKey: anchorageStyleKey
			}
		},
		{
			type: 'Feature',
			id: 'poi-two',
			geometry: { type: 'Point', coordinates: [16.3, 43.3] },
			properties: {
				title: 'Marina Kaštela',
				description: '<p>Marina nær Split.</p>',
				snippet: '',
				address: '',
				layerId: layerOne.id,
				layerName: layerOne.name,
				layerPath: layerOne.path,
				extendedData: {},
				style: { color: '#0288d1', iconHref: googleIconHref },
				sourceStyleKey: marinaStyleKey
			}
		},
		{
			type: 'Feature',
			id: 'route-one',
			geometry: {
				type: 'LineString',
				coordinates: [
					[16.2, 43.2],
					[16.3, 43.3]
				]
			},
			properties: {
				title: 'Første etappe',
				description: '',
				snippet: '',
				address: '',
				layerId: layerTwo.id,
				layerName: layerTwo.name,
				layerPath: layerTwo.path,
				extendedData: {},
				style: { color: '#dc6b3f' }
			}
		}
	]
};

async function mockMap(page: Page): Promise<void> {
	await page.route('**/api/map{,/**}', async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (pathname === '/api/map/offline') {
			await route.fulfill({
				json: {
					packages: [
						{
							mode: 'normal',
							name: 'Vanlig kart',
							version: 'test',
							size: 8,
							url: '/api/map/offline/normal'
						}
					]
				}
			});
			return;
		}
		if (pathname === '/api/map/offline/normal') {
			await route.fulfill({
				body: Buffer.from([80, 77, 84, 105, 108, 101, 115, 3]),
				contentType: 'application/vnd.pmtiles'
			});
			return;
		}
		if (
			pathname.startsWith('/api/map/depth-contours/') ||
			pathname.startsWith('/api/map/marine-profile/')
		) {
			await route.fulfill({ body: transparentPng, contentType: 'image/png' });
			return;
		}
		if (pathname === '/api/map/harbours') {
			await route.fulfill({ json: { type: 'FeatureCollection', features: [] } });
			return;
		}
		await route.fulfill({ json: { snapshot, stale: false, refreshing: false, sourceMapId } });
	});
	await page.route('https://tiles.openfreemap.org/styles/bright*', async (route) => {
		await route.fulfill({
			json: {
				version: 8,
				sources: {
					base: {
						type: 'vector',
						tiles: ['http://127.0.0.1:4173/test-vector-tile/{z}/{x}/{y}.pbf'],
						attribution: 'Test map data'
					}
				},
				layers: [
					{ id: 'background', type: 'background', paint: { 'background-color': '#d7e8ef' } },
					{
						id: 'water',
						type: 'fill',
						source: 'base',
						'source-layer': 'water',
						paint: { 'fill-color': '#9fc7df' }
					}
				]
			}
		});
	});
	await page.route('**/test-vector-tile/**', async (route) => {
		await route.fulfill({
			body: openFreeMapVectorTile,
			contentType: 'application/vnd.mapbox-vector-tile'
		});
	});
	await page.route(
		/https:\/\/(server\.arcgisonline\.com|tiles\.openseamap\.org|tiles\.maps\.eox\.at)\/.*/,
		async (route) => {
			await route.fulfill({ body: transparentPng, contentType: 'image/png' });
		}
	);
}

async function login(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

const actualLeg = {
	from: { kind: 'text', name: 'Split' },
	to: { kind: 'text', name: 'Hvar' },
	departure: '10:00',
	arrival: '11:00',
	nauticalMiles: 4,
	sailingMinutes: 30,
	engineMinutes: 30,
	mooring: 'anchor',
	customMooring: '',
	gpx: {
		id: '019d0d25-8ea0-7000-8000-000000000001',
		filename: 'orca.gpx',
		checksum: 'a'.repeat(64),
		byteSize: 100,
		version: 1,
		name: 'Tur',
		departureAt: '2026-09-05T08:00:00.000Z',
		arrivalAt: '2026-09-05T09:00:00.000Z',
		nauticalMiles: 4,
		activeSeconds: 3_000,
		elapsedSeconds: 3_600,
		stationarySeconds: 600,
		originalPointCount: 100,
		routePointCount: 2,
		segments: [
			[
				[16.21, 43.21],
				[16.29, 43.29]
			]
		],
		stationaryBlocks: [],
		recordingGaps: []
	},
	createdAt: '2026-09-05T10:00:00.000Z',
	createdBy: 'map-test',
	tombstone: false
};

test('searches, filters, refreshes, and opens point details without mobile overflow', async ({
	page
}) => {
	const pageErrors: string[] = [];
	const googleIconRequests: string[] = [];
	const vectorTileRequests: string[] = [];
	const satelliteRequests: string[] = [];
	const marineProfileRequests: string[] = [];
	const harbourRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (request.url().includes('/test-vector-tile/')) {
			vectorTileRequests.push(request.url());
		}
		if (request.url().includes('/World_Imagery/MapServer/tile/')) {
			satelliteRequests.push(request.url());
		}
		if (request.url() === googleIconHref) {
			googleIconRequests.push(request.url());
		}
		if (request.url().includes('/api/map/marine-profile/')) {
			marineProfileRequests.push(request.url());
		}
		if (request.url().includes('/api/map/harbours?')) {
			harbourRequests.push(request.url());
		}
	});
	await mockMap(page);
	await login(page);
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	await expect.poll(() => vectorTileRequests.length).toBeGreaterThan(0);

	await expect(page.getByRole('link', { name: 'Kart' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('link', { name: 'Opptak' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Loggbok' })).toBeVisible();
	const attribution = page.locator('.maplibregl-ctrl-attrib');
	await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
	await page.locator('.maplibregl-ctrl-attrib-button').click();
	await expect(attribution).toHaveClass(/maplibregl-compact-show/);
	await page.locator('.maplibregl-ctrl-attrib-button').click();
	await expect(page.getByRole('button', { name: 'Vanlig' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Satellitt' }).click();
	await expect(page.getByRole('button', { name: 'Satellitt' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect.poll(() => satelliteRequests.length).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Sjøkart' }).click();
	await expect.poll(() => marineProfileRequests.length).toBeGreaterThan(0);
	await expect.poll(() => harbourRequests.length).toBeGreaterThan(0);
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Stiniva');
	await page.getByRole('button', { name: /Stiniva-bukten/ }).click();
	await expect(page.getByRole('heading', { name: 'Stiniva-bukten' })).toBeVisible();
	await expect(page.getByText('En smal bukt med klart vann.')).toBeVisible();
	await expect(page.getByText('Navn', { exact: true })).toBeVisible();
	await expect(page.getByText('Beskrivelse', { exact: true })).toBeVisible();
	await expect(page.getByText('naziv', { exact: true })).toHaveCount(0);
	await expect(page.getByText('opis', { exact: true })).toHaveCount(0);
	await expect(page.getByText('8–12 meter')).toBeVisible();
	await expect(
		page.locator('div[data-source-icon-href]', { hasText: 'Ankerplasser og fortøyninger' })
	).toHaveAttribute('data-source-icon-href', googleIconHref);
	await expect(page.getByRole('link', { name: 'Åpne i Google Maps' })).toHaveAttribute(
		'href',
		'https://www.google.com/maps/search/?api=1&query=Stiniva-bukten%20Vis%2C%20Kroatia%2043.25%2C16.25'
	);

	await page.getByRole('button', { name: 'Oppdater kartet' }).click();
	await expect(page.getByRole('heading', { name: 'Stiniva-bukten' })).toBeVisible();
	await page.getByRole('button', { name: 'Lukk detaljer' }).click();
	await page.getByRole('button', { name: 'Velg kartlag' }).click();
	await expect(page.getByRole('heading', { name: 'Kartlag' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Åpne hele kartet i Google Maps' })).toHaveAttribute(
		'href',
		sourceUrl
	);
	await expect(page.getByRole('heading', { name: 'Lag i sjøkartet' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Dagens kartpunkter' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Kart uten nett' })).toBeVisible();
	const offlineMaps = page.locator('[data-offline-maps]');
	await expect(offlineMaps.getByText('Vanlig', { exact: true })).toBeVisible();
	await expect(offlineMaps.getByText('Sjøkart', { exact: true })).toHaveCount(0);
	await expect(offlineMaps.getByText('Satellitt', { exact: true })).toHaveCount(0);
	await expect(offlineMaps.getByRole('button', { name: 'Last ned', exact: true })).toBeVisible();
	await offlineMaps.getByRole('button', { name: 'Last ned', exact: true }).click();
	await expect(offlineMaps.getByText(/Lagret ·/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Typer kartpunkter' })).toBeVisible();
	await expect(page.getByText('Ankerplasser og fortøyninger', { exact: true })).toBeVisible();
	await expect(page.getByText('Marinaer og havner', { exact: true })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Vanndybder' })).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: 'Sjømerker' })).toHaveCount(0);
	const sourceSection = page.locator('section').filter({
		has: page.getByText('Kilder:', { exact: false })
	});
	await expect(sourceSection.getByRole('link', { name: 'OpenFreeMap' })).toBeVisible();
	await expect(sourceSection.getByRole('link', { name: 'OpenSeaMap' })).toBeVisible();
	await expect(
		page.getByRole('link', { name: 'Offisielle kroatiske sjøkart hos HHI' })
	).toBeVisible();
	await expect(
		page.locator('button[data-source-icon-href]', {
			hasText: 'Ankerplasser og fortøyninger'
		})
	).toHaveAttribute('data-source-icon-href', googleIconHref);
	const anchorageFilter = page.getByRole('button', {
		name: /Ankerplasser og fortøyninger/
	});
	await expect(anchorageFilter).toHaveAttribute('aria-pressed', 'false');
	await anchorageFilter.click();
	await expect(anchorageFilter).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Lukk kartlag' }).last().click();
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Marina Kaštela');
	await expect(page.getByText('Ingen treff.')).toBeVisible();
	await page.getByRole('button', { name: 'Velg kartlag' }).click();
	await page.getByRole('button', { name: /Marinaer og havner/ }).click();
	await expect(page.getByText('2 typer vises.')).toBeVisible();
	const googleGroup = page
		.getByRole('complementary')
		.getByRole('button', { name: /Anker, bøye og marina/ });
	await expect(googleGroup).toHaveAttribute('aria-pressed', 'false');
	await googleGroup.click();
	await expect(googleGroup).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('1 gruppe vises.')).toBeVisible();
	await page.getByRole('button', { name: 'Nullstill filtre' }).click();
	await expect(page.getByText('Alle typer vises.')).toBeVisible();
	await expect(page.getByText('Alle grupper vises.')).toBeVisible();
	await expect(anchorageFilter).toHaveAttribute('aria-pressed', 'false');
	await expect(googleGroup).toHaveAttribute('aria-pressed', 'false');
	const drawerDimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(drawerDimensions.width).toBeLessThanOrEqual(drawerDimensions.viewport);
	await page.getByRole('button', { name: 'Dagens etappe' }).click();
	await page.getByRole('button', { name: 'Lukk kartlag' }).last().click();
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Stiniva');
	await expect(page.getByText('Ingen treff.')).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
	expect(googleIconRequests).toEqual([]);
	expect(marineProfileRequests.length).toBeGreaterThan(0);
	expect(harbourRequests.length).toBeGreaterThan(0);
	expect(pageErrors).toEqual([]);
});

test('shows map bearing and resets north from the compass', async ({ page }) => {
	await mockMap(page);
	await login(page);
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	const compass = page.getByRole('button', { name: 'Tilbakestill kartretning mot nord' });
	await expect(compass).toHaveCount(0);
	const canvas = page.locator('.maplibregl-canvas');
	const box = await canvas.boundingBox();
	if (!box) throw new Error('MAP_CANVAS_UNAVAILABLE');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down({ button: 'right' });
	await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
	await page.mouse.up({ button: 'right' });
	await expect(compass).toBeVisible();
	await compass.click();
	await expect(compass).toHaveCount(0);
});

test('replaces a planned day route with the accumulated GPX track', async ({ page }) => {
	await mockMap(page);
	await login(page);
	const gpxId = crypto.randomUUID();
	await page.evaluate(
		async ({ leg, id }) => {
			leg.gpx.id = id;
			const response = await fetch('/api/state/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					mutations: [
						{
							mutationId: crypto.randomUUID(),
							clientId: 'map-test',
							key: `logbook:d0:leg:${crypto.randomUUID()}`,
							value: leg,
							clientTimestamp: Date.now()
						}
					]
				})
			});
			if (!response.ok) throw new Error('STATE_SETUP_FAILED');
		},
		{ leg: actualLeg, id: gpxId }
	);
	await page.reload();

	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	await expect(page.locator('[data-actual-route-ids]')).toHaveAttribute(
		'data-actual-route-ids',
		new RegExp(gpxId)
	);
	await expect(page.locator('[data-hidden-route-count]')).toHaveAttribute(
		'data-hidden-route-count',
		'1'
	);
	await expect(page.locator('[data-trip-nautical-miles]')).toContainText('nm');
});
test('starts explicit geolocation and follows the device position', async ({ page, context }) => {
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ longitude: 16.24, latitude: 43.51, accuracy: 25 });
	await mockMap(page);
	await login(page);

	await page.getByRole('button', { name: 'Finn posisjonen min' }).click();
	await expect(page.getByRole('button', { name: 'Følger posisjonen din' })).toBeVisible();
	await expect(page.locator('[data-position-marker]')).toHaveAttribute(
		'data-position-marker',
		'monsieur-bintang'
	);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('restores the cached map snapshot when the map API is unavailable', async ({ page }) => {
	let mapAvailable = true;
	await page.route('**/api/map{,/**}', async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (pathname === '/api/map/offline') {
			await route.fulfill({ json: { packages: [] } });
			return;
		}
		if (!mapAvailable) {
			await route.abort('failed');
			return;
		}
		await route.fulfill({ json: { snapshot, stale: false, refreshing: false } });
	});
	await page.route('https://tiles.openfreemap.org/styles/bright*', async (route) => {
		await route.fulfill({ json: { version: 8, sources: {}, layers: [] } });
	});
	await login(page);
	await expect(page.getByRole('searchbox', { name: 'Søk i kartet' })).toBeVisible();
	await expect(page.getByRole('status')).toContainText('Oppdatert');
	await expect
		.poll(() =>
			page.evaluate(
				(): Promise<boolean> =>
					new Promise((resolve, reject) => {
						const request = indexedDB.open('gjemmekontor-data');
						request.onerror = (): void => reject(request.error);
						request.onsuccess = (): void => {
							const database = request.result;
							const transaction = database.transaction('mapSnapshot', 'readonly');
							const record = transaction.objectStore('mapSnapshot').get('current');
							record.onerror = (): void => reject(record.error);
							record.onsuccess = (): void => {
								database.close();
								resolve(record.result !== undefined);
							};
						};
					})
			)
		)
		.toBe(true);

	mapAvailable = false;
	await page.reload();

	await expect(page.getByRole('searchbox', { name: 'Søk i kartet' })).toBeVisible();
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Stiniva');
	await expect(page.getByRole('button', { name: /Stiniva-bukten/ })).toBeVisible();
	await expect(
		page.getByText('Får ikke kontakt med serveren. Viser sist lagrede kart hvis det finnes.')
	).toBeVisible();
});
