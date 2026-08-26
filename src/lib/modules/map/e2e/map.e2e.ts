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

async function mockMap(page: Page, mapSnapshot = snapshot): Promise<void> {
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
		if (pathname === '/api/map/ais') {
			await route.fulfill({
				json: {
					type: 'FeatureCollection',
					status: 'connected',
					lastMessageAt: '2026-08-25T12:00:00.000Z',
					features: [
						{
							type: 'Feature',
							id: 'ais-257069200',
							geometry: { type: 'Point', coordinates: [16.25, 43.25] },
							properties: {
								mmsi: 257069200,
								name: 'KV FARM',
								callSign: 'LBHF',
								shipType: 55,
								navigationStatus: 0,
								speedOverGround: 12.4,
								courseOverGround: 86.7,
								trueHeading: 87,
								direction: 87,
								lengthMeters: 47,
								widthMeters: 14,
								destination: 'SPLIT',
								lastSeenAt: '2026-08-25T12:00:00.000Z'
							}
						}
					]
				}
			});
			return;
		}
		await route.fulfill({
			json: { snapshot: mapSnapshot, stale: false, refreshing: false, sourceMapId }
		});
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
					},
					openFreeMapPois: {
						type: 'geojson',
						data: {
							type: 'FeatureCollection',
							features: [
								{
									type: 'Feature',
									geometry: { type: 'Point', coordinates: [16.25, 43.22] },
									properties: {
										name: 'Konoba OpenFreeMap',
										class: 'restaurant',
										rank: 1
									}
								}
							]
						}
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
					},
					{
						id: 'poi_r1',
						type: 'circle',
						source: 'openFreeMapPois',
						paint: {
							'circle-color': '#9a5b3f',
							'circle-radius': 9,
							'circle-stroke-color': '#ffffff',
							'circle-stroke-width': 2
						}
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

async function openMoreModule(page: Page, name: 'Loggbok' | 'Utstyr'): Promise<void> {
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name }).click();
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
	});
	await mockMap(page);
	await login(page);
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	await expect.poll(() => vectorTileRequests.length).toBeGreaterThan(0);

	await expect(page.getByRole('link', { name: 'Kart' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('link', { name: 'Opptak' })).toBeVisible();
	await page.getByRole('button', { name: 'Mer' }).click();
	const moreDialog = page.getByRole('dialog');
	await expect(moreDialog.getByRole('link', { name: 'Loggbok' })).toBeVisible();
	await expect(moreDialog.getByRole('link', { name: 'Utstyr' })).toBeVisible();
	await page.keyboard.press('Escape');
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
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Stiniva');
	await page.getByRole('button', { name: /Stiniva-bukten/ }).click();
	await expect(page.getByRole('heading', { name: 'Stiniva-bukten' })).toBeVisible();
	await expect(page.getByText('En smal bukt med klart vann.')).toBeVisible();
	await expect(page.getByText('Navn', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Beskrivelse', { exact: true })).toBeVisible();
	await expect(page.getByText('naziv', { exact: true })).toHaveCount(0);
	await expect(page.getByText('opis', { exact: true })).toHaveCount(0);
	await expect(page.getByText('8–12 meter')).toBeVisible();
	await expect(
		page.locator('div[data-source-icon-href]', { hasText: 'Ankerplasser og fortøyninger' })
	).toHaveAttribute('data-source-icon-href', googleIconHref);
	await expect(page.getByRole('link', { name: 'Åpne i Google Maps' })).toHaveAttribute(
		'href',
		'https://www.google.com/maps/search/?api=1&query=Stiniva-bukten%2C%20Vis%2C%20Kroatia'
	);
	await expect(page.getByRole('link', { name: 'Vis posisjonen i Google Maps' })).toHaveCount(0);

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
	await expect(page.getByRole('button', { name: /Marina Kaštela/ })).toBeVisible();
	await page.getByRole('button', { name: /Marina Kaštela/ }).click();
	await expect(page.getByRole('heading', { name: 'Marina Kaštela' })).toBeVisible();
	await page.getByRole('button', { name: 'Lukk detaljer' }).click();
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
	await expect(page.getByRole('button', { name: /Stiniva-bukten/ })).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
	expect(googleIconRequests).toEqual([]);
	expect(marineProfileRequests.length).toBeGreaterThan(0);
	expect(pageErrors).toEqual([]);
});

test('loads and reuses lazy Google and Tripadvisor POI enrichment', async ({ page }) => {
	let enrichmentRequests = 0;
	let photoRequests = 0;
	let photosHaveLoaded = false;
	let googleScriptRequests = 0;
	const tripadvisorPhotos = Array.from({ length: 5 }, (_, index) => ({
		thumbnailUrl: `https://dynamic-media-cdn.tripadvisor.com/tripadvisor-thumb-${index}.jpg`,
		imageUrl: `https://dynamic-media-cdn.tripadvisor.com/tripadvisor-large-${index}.jpg`,
		caption: `Marina sett fra sjøen ${index + 1}`
	}));
	const googleRequestFailures: string[] = [];
	const pageErrors: string[] = [];
	page.on('requestfailed', (request) => {
		if (request.url().includes('maps.googleapis.com')) {
			googleRequestFailures.push(`${request.url()}: ${request.failure()?.errorText}`);
		}
	});
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await mockMap(page);
	await page.route('**/api/map/poi/poi-two/enrichment', async (route) => {
		enrichmentRequests += 1;
		await route.fulfill({
			json: {
				featureId: 'poi-two',
				google: {
					status: 'available',
					placeId: 'ChIJ1234567890_test',
					uiKitKey: 'browser-test-key'
				},
				tripadvisor: {
					status: 'available',
					locationId: '123456',
					rating: 4.7,
					reviewCount: 321,
					webUrl: 'https://www.tripadvisor.com/test',
					photosUrl: 'https://www.tripadvisor.com/test/photos',
					photos: photosHaveLoaded ? tripadvisorPhotos : [],
					photosLoaded: photosHaveLoaded,
					cachedAt: '2026-08-25T10:00:00.000Z',
					expiresAt: '2026-09-24T10:00:00.000Z'
				}
			}
		});
	});
	await page.route('**/api/map/poi/poi-two/enrichment/photos', async (route) => {
		photoRequests += 1;
		photosHaveLoaded = true;
		await route.fulfill({
			json: {
				featureId: 'poi-two',
				tripadvisor: {
					status: 'available',
					locationId: '123456',
					rating: 4.7,
					reviewCount: 321,
					webUrl: 'https://www.tripadvisor.com/test',
					photosUrl: 'https://www.tripadvisor.com/test/photos',
					photos: tripadvisorPhotos,
					photosLoaded: true,
					cachedAt: '2026-08-25T10:01:00.000Z',
					expiresAt: '2026-09-24T10:01:00.000Z'
				}
			}
		});
	});
	await page.route(/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?.*/, async (route) => {
		googleScriptRequests += 1;
		await route.fulfill({
			contentType: 'application/javascript',
			body: `
				class TestPlace {
					async fetchFields() {
						window.__googlePlaceFetches = (window.__googlePlaceFetches || 0) + 1;
						this.rating = 4.5;
						this.userRatingCount = 238;
						this.priceLevel = 'MODERATE';
						this.primaryTypeDisplayName = 'Italiensk restaurant';
						this.googleMapsURI = 'https://www.google.com/maps/place/test';
						this.attributions = [];
						this.utcOffsetMinutes = 120;
						this.currentOpeningHours = {
							periods: [{ open: { day: 0, hour: 0, minute: 0 } }]
						};
						this.photos = Array.from({ length: 5 }, (_, index) => ({
							authorAttributions: [{ displayName: 'Google traveler' }],
							getURI: () => 'https://lh3.googleusercontent.com/google-place-photo-' + index + '.jpg'
						}));
					}
				}
				window.google = { maps: { importLibrary: async () => ({ Place: TestPlace }) } };
				const callback = new URL(document.currentScript.src).searchParams.get('callback');
				if (callback && typeof window[callback] === 'function') window[callback]();
			`
		});
	});
	await page.route('https://dynamic-media-cdn.tripadvisor.com/**', async (route) => {
		await route.fulfill({ body: transparentPng, contentType: 'image/png' });
	});
	await page.route('https://lh3.googleusercontent.com/**', async (route) => {
		await route.fulfill({ body: transparentPng, contentType: 'image/png' });
	});
	await page.route('https://www.gstatic.com/images/branding/googlelogo/**', async (route) => {
		await route.fulfill({ body: transparentPng, contentType: 'image/png' });
	});

	await login(page);
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Marina Kaštela');
	await page.getByRole('button', { name: /Marina Kaštela/ }).click();
	await expect(page.locator('[data-tripadvisor-details]')).toContainText('4,7');
	await expect(page.locator('[data-tripadvisor-details]')).toContainText(/4,7\s*\(321\)/);
	await expect(page.getByRole('link', { name: 'Åpne stedet på Tripadvisor' })).toHaveAttribute(
		'href',
		'https://www.tripadvisor.com/test'
	);
	await expect.poll(() => googleScriptRequests).toBe(1);
	expect(googleRequestFailures).toEqual([]);
	expect(pageErrors).toEqual([]);
	await expect(page.locator('[data-google-place-details]')).toContainText('4,5');
	await expect(page.locator('[data-google-place-details]')).toContainText(/4,5\s*\(238\)/);
	await expect(page.locator('[data-google-place-details]')).toContainText('Italiensk restaurant');
	await expect(page.locator('[data-google-place-details]')).toContainText('$$');
	const googleOpeningHours = page.locator('[data-google-opening-hours]');
	await expect(googleOpeningHours).toContainText('Åpent nå');
	await expect(googleOpeningHours).toContainText('I dag Døgnåpent');
	await googleOpeningHours.locator('summary').click();
	await expect(googleOpeningHours).toContainText('Mandag');
	await expect(googleOpeningHours.getByText('Døgnåpent', { exact: true })).toHaveCount(7);
	await expect(page.getByRole('link', { name: 'Åpne stedet i Google Maps' })).toHaveAttribute(
		'href',
		'https://www.google.com/maps/place/test'
	);
	await expect(page.getByRole('button', { name: /Vis Google-bilde/ })).toHaveCount(3);
	await expect(page.getByRole('button', { name: 'Vis Google-bilde 1 av 5' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Åpne i Google Maps' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Vis Tripadvisor-bilde/ })).toHaveCount(3);
	const tripadvisorPhoto = page.getByRole('img', { name: 'Marina sett fra sjøen 1' });
	await expect(tripadvisorPhoto).toBeVisible();
	await expect
		.poll(() => tripadvisorPhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth))
		.toBe(1);
	await page.getByRole('button', { name: 'Vis Tripadvisor-bilde 1 av 5' }).click();
	await expect(page.getByRole('dialog', { name: 'Tripadvisor-bildevisning' })).toContainText(
		'1 / 5'
	);
	for (let photoIndex = 1; photoIndex < 5; photoIndex += 1) {
		await page.getByRole('button', { name: 'Neste bilde' }).click();
	}
	await expect(page.getByRole('dialog', { name: 'Tripadvisor-bildevisning' })).toContainText(
		'5 / 5'
	);
	await page.getByRole('button', { name: 'Lukk bildevisning' }).last().click();
	await expect(page.locator('[data-photo-viewer="Tripadvisor"]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Lukk detaljer' }).click();
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Marina Kaštela');
	await page.getByRole('button', { name: /Marina Kaštela/ }).click();
	await expect(page.locator('[data-google-place-details]')).toContainText('4,5');

	expect(enrichmentRequests).toBe(2);
	expect(photoRequests).toBe(1);
	expect(googleScriptRequests).toBe(1);
	expect(
		await page.evaluate(
			() => (window as typeof window & { __googlePlaceFetches?: number }).__googlePlaceFetches
		)
	).toBe(2);
});

test('opens an OpenFreeMap restaurant in the shared Google and Tripadvisor POI sheet', async ({
	page
}) => {
	const enrichmentBodies: unknown[] = [];
	await mockMap(page);
	await page.route('**/api/map/poi/openfreemap/enrichment', async (route) => {
		enrichmentBodies.push(route.request().postDataJSON());
		await route.fulfill({
			json: {
				featureId: `openfreemap:${'a'.repeat(64)}`,
				google: {
					status: 'available',
					placeId: 'ChIJ1234567890_openfreemap',
					uiKitKey: 'browser-test-key'
				},
				tripadvisor: {
					status: 'available',
					locationId: '654321',
					rating: 4.8,
					reviewCount: 88,
					webUrl: 'https://www.tripadvisor.com/openfreemap-test',
					photos: [],
					photosLoaded: true,
					cachedAt: '2026-08-26T10:00:00.000Z',
					expiresAt: '2026-09-25T10:00:00.000Z'
				}
			}
		});
	});
	await page.route(/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?.*/, async (route) => {
		await route.fulfill({
			contentType: 'application/javascript',
			body: `
				class TestPlace {
					async fetchFields() {
						this.rating = 4.6;
						this.userRatingCount = 120;
						this.googleMapsURI = 'https://www.google.com/maps/place/openfreemap-test';
						this.attributions = [];
						this.photos = [];
					}
				}
				window.google = { maps: { importLibrary: async () => ({ Place: TestPlace }) } };
				const callback = new URL(document.currentScript.src).searchParams.get('callback');
				if (callback && typeof window[callback] === 'function') window[callback]();
			`
		});
	});
	await page.route('https://www.gstatic.com/images/branding/googlelogo/**', async (route) => {
		await route.fulfill({ body: transparentPng, contentType: 'image/png' });
	});

	await login(page);
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	const canvas = page.locator('.maplibregl-canvas');
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	await canvas.click({
		position: { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 + 43 }
	});

	await expect(page.getByRole('heading', { name: 'Konoba OpenFreeMap' })).toBeVisible();
	await expect(page.locator('[data-poi-sheet]')).toContainText('OpenFreeMap');
	await expect(page.locator('[data-google-place-details]')).toContainText('4,6');
	await expect(page.locator('[data-tripadvisor-details]')).toContainText('4,8');
	await expect(page.locator('[data-poi-sheet]')).not.toContainText('Oppdatert');
	await expect.poll(() => enrichmentBodies.length).toBe(1);
	expect(enrichmentBodies[0]).toMatchObject({
		source: 'openfreemap',
		title: 'Konoba OpenFreeMap',
		category: 'restaurant'
	});
	expect((enrichmentBodies[0] as { longitude: number }).longitude).toBeCloseTo(16.25, 3);
	expect((enrichmentBodies[0] as { latitude: number }).latitude).toBeCloseTo(43.22, 3);
});

test('shows, selects, and toggles the live AIS vessel layer', async ({ page }) => {
	const aisStyleErrors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('layers.ais-vessels')) {
			aisStyleErrors.push(message.text());
		}
	});
	await mockMap(page);
	await login(page);
	const map = page.locator('[data-map-ready]');
	await expect(map).toHaveAttribute('data-map-ready', 'true');
	await expect(map).toHaveAttribute('data-ais-vessel-count', '1');
	expect(aisStyleErrors).toEqual([]);

	const canvas = page.locator('.maplibregl-canvas');
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	await canvas.click({ position: { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 } });
	await expect(page.getByRole('heading', { name: 'KV FARM' })).toBeVisible();
	await expect(page.getByText('MMSI 257069200')).toBeVisible();
	await expect(page.getByText('Kallesignal LBHF')).toBeVisible();
	await expect(page.getByText('47 m / 154 ft lang · 14 m bred')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Mer informasjon og bilder' })).toHaveAttribute(
		'href',
		'https://ships25.com/no/vessel/detail/257069200'
	);
	await page.getByRole('button', { name: 'Lukk fartøydetaljer' }).click();

	await page.getByRole('button', { name: 'Velg kartlag' }).click();
	const aisToggle = page.locator('[data-ais-toggle]');
	await expect(aisToggle).toHaveAttribute('aria-pressed', 'true');
	await expect(aisToggle).toContainText('1 fartøy');
	await aisToggle.click();
	await expect(aisToggle).toHaveAttribute('aria-pressed', 'false');
	await expect(map).toHaveAttribute('data-ais-vessel-count', '0');
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

test('centers the selected POI after closing the mobile sheet', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mockMap(page);
	await login(page);
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	await page.getByRole('searchbox', { name: 'Søk i kartet' }).fill('Stiniva');
	await page.getByRole('button', { name: /Stiniva-bukten/ }).click();
	await expect(page.getByRole('heading', { name: 'Stiniva-bukten' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mapCamera'))).not.toBeNull();
	const openedCenter = await page.evaluate(() => {
		const value = sessionStorage.getItem('mapCamera');
		if (!value) throw new Error('MAP_CAMERA_MISSING');
		return (JSON.parse(value) as { center: [number, number] }).center;
	});
	expect(openedCenter).not.toEqual([16.25, 43.25]);
	await page.getByRole('button', { name: 'Lukk detaljer' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const value = sessionStorage.getItem('mapCamera');
				if (!value) return Number.POSITIVE_INFINITY;
				const center = (JSON.parse(value) as { center: [number, number] }).center;
				return Math.max(Math.abs(center[0] - 16.25), Math.abs(center[1] - 43.25));
			})
		)
		.toBeLessThan(1e-10);
});

test('restores map position and zoom after app navigation', async ({ page }) => {
	await mockMap(page);
	await login(page);
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	await expect(page.getByRole('button', { name: 'Tilbakestill kartutsnitt' })).toHaveCount(0);
	const canvas = page.locator('.maplibregl-canvas');
	const box = await canvas.boundingBox();
	if (!box) throw new Error('MAP_CANVAS_UNAVAILABLE');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50, { steps: 10 });
	await page.mouse.up();
	await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mapCamera'))).not.toBeNull();
	const zoomBefore = await page.evaluate(() => {
		const value = sessionStorage.getItem('mapCamera');
		return value ? (JSON.parse(value) as { zoom: number }).zoom : 0;
	});
	await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const value = sessionStorage.getItem('mapCamera');
				return value ? (JSON.parse(value) as { zoom: number }).zoom : 0;
			})
		)
		.toBeGreaterThan(zoomBefore + 0.5);
	const camera = await page.evaluate(() => {
		const value = sessionStorage.getItem('mapCamera');
		if (!value) throw new Error('MAP_CAMERA_MISSING');
		const parsed = JSON.parse(value) as { bearing: number };
		parsed.bearing = 32;
		const updated = JSON.stringify(parsed);
		sessionStorage.setItem('mapCamera', updated);
		return updated;
	});
	await page.getByRole('link', { name: 'Opptak' }).click();
	await expect(page).toHaveURL(/\/shots/);
	await page.getByRole('link', { name: 'Kart' }).click();
	await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready', 'true');
	await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mapCamera'))).toBe(camera);
	await expect(
		page.getByRole('button', { name: 'Tilbakestill kartretning mot nord' })
	).toBeVisible();
	const resetView = page.getByRole('button', { name: 'Tilbakestill kartutsnitt' });
	await expect(resetView).toBeVisible();
	await resetView.click();
	await expect(resetView).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mapCamera'))).toBeNull();
});

test('shows all map points after the Google day folders end', async ({ page }) => {
	await mockMap(page);
	await login(page);
	await openMoreModule(page, 'Loggbok');
	await page.getByRole('combobox', { name: 'Velg dag' }).selectOption({ index: 15 });
	await page.getByRole('link', { name: 'Kart' }).click();
	await page.getByRole('button', { name: 'Velg kartlag' }).click();
	await expect(
		page.getByText(
			'Google-kartets dagsmapper dekker 5.–18. september. Alle kartpunkter vises for søndag 20. september.'
		)
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dagens etappe' })).toBeDisabled();
});

test('uses the device date for today instead of another page selection', async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-09-10T10:00:00.000Z'));
	await mockMap(page, {
		...snapshot,
		layers: [
			...snapshot.layers,
			{
				id: 'day-six-seven',
				name: 'Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo',
				path: ['Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo'],
				color: '#dc6b3f',
				featureCount: 0,
				pointCount: 0,
				lineCount: 0
			}
		]
	});
	await login(page);
	await openMoreModule(page, 'Loggbok');
	const day = page.getByRole('combobox', { name: 'Velg dag' });
	await expect(day).toHaveValue('5');
	await day.selectOption({ index: 15 });
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(day).toHaveValue('5');
	await day.selectOption({ index: 15 });
	await page.getByRole('link', { name: 'Kart' }).click();
	await page.getByRole('button', { name: 'Velg kartlag' }).click();
	await expect(
		page.getByRole('paragraph').filter({
			hasText: 'Dag 6 og 7 - Torsdag og Fredag - Susac og Lastovo'
		})
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dagens etappe' })).toBeEnabled();
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
test('starts explicit geolocation and follows the device position', async ({ page }) => {
	const positionStyleErrors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('layers.position')) {
			positionStyleErrors.push(message.text());
		}
	});
	await page.addInitScript(() => {
		let update: PositionCallback | undefined;
		const emit = (
			speed: number,
			heading: number | null,
			longitude: number,
			latitude: number
		): void => {
			update?.({
				coords: {
					accuracy: 20,
					altitude: null,
					altitudeAccuracy: null,
					heading,
					latitude,
					longitude,
					speed,
					toJSON: () => ({})
				},
				timestamp: Date.now(),
				toJSON: () => ({})
			});
		};
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				clearWatch: (): void => {
					update = undefined;
				},
				watchPosition: (next: PositionCallback): number => {
					update = next;
					emit(0, 0, 16.24, 43.51);
					return 1;
				}
			}
		});
		Object.defineProperty(window, '__setMapTestGeolocation', {
			configurable: true,
			value: emit
		});
	});
	await mockMap(page);
	await login(page);

	await page.getByRole('button', { name: 'Finn posisjonen min' }).click();
	await expect(page.getByRole('button', { name: 'Følger posisjonen din' })).toBeVisible();
	const positionMarker = page.locator('[data-position-marker]');
	const telemetry = page.locator('[data-vessel-telemetry]');
	await expect(positionMarker).toHaveAttribute('data-position-marker', 'monsieur-bintang');
	await expect(positionMarker).toHaveAttribute('data-position-speed-knots', '');
	await expect(telemetry).toHaveCount(0);

	await page.evaluate(() => {
		(
			window as unknown as {
				__setMapTestGeolocation: (
					speed: number,
					heading: number | null,
					longitude: number,
					latitude: number
				) => void;
			}
		).__setMapTestGeolocation(2, 270, 16.241, 43.511);
	});
	await expect(positionMarker).toHaveAttribute('data-position-heading', '270');
	await expect(positionMarker).toHaveAttribute('data-position-speed-knots', '3.9');
	await expect(telemetry).toContainText('3,9');
	await expect(telemetry).toContainText('kn');
	await expect(telemetry).toContainText('270°');
	await page.evaluate(() => {
		(
			window as unknown as {
				__setMapTestGeolocation: (
					speed: number,
					heading: number | null,
					longitude: number,
					latitude: number
				) => void;
			}
		).__setMapTestGeolocation(0, null, 16.241, 43.511);
	});
	await expect(positionMarker).toHaveAttribute('data-position-speed-knots', '');
	await expect(telemetry).toHaveCount(0);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	expect(positionStyleErrors).toEqual([]);
});

test('restores the cached map snapshot when the map API is unavailable', async ({ page }) => {
	let mapAvailable = true;
	await page.route('**/api/map{,/**}', async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (pathname === '/api/map/offline') {
			await route.fulfill({ json: { packages: [] } });
			return;
		}
		if (pathname === '/api/map/ais') {
			await route.fulfill({
				json: { type: 'FeatureCollection', features: [], status: 'connected' }
			});
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
							const transaction = database.transaction('moduleData', 'readonly');
							const record = transaction.objectStore('moduleData').get('map:snapshot:current');
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
