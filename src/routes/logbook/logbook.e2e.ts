import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

const gpx = `<?xml version="1.0"?><gpx creator="Orca App" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Testetappe</name><trkseg><trkpt lat="43" lon="16"><time>2026-09-05T08:00:00Z</time></trkpt><trkpt lat="43" lon="16"><time>2026-09-05T08:01:00Z</time></trkpt><trkpt lat="43" lon="16"><time>2026-09-05T08:02:00Z</time></trkpt><trkpt lat="43" lon="16"><time>2026-09-05T08:03:00Z</time></trkpt><trkpt lat="43.01" lon="16"><time>2026-09-05T08:03:20Z</time></trkpt><trkpt lat="43.02" lon="16"><time>2026-09-05T08:03:40Z</time></trkpt><trkpt lat="43.02" lon="16"><time>2026-09-05T08:04:40Z</time></trkpt><trkpt lat="43.02" lon="16"><time>2026-09-05T08:05:40Z</time></trkpt><trkpt lat="43.02" lon="16"><time>2026-09-05T08:06:40Z</time></trkpt></trkseg></trk></gpx>`;

function largeGpx(pointCount: number): string {
	const points = Array.from({ length: pointCount }, (_value, index) => {
		const longitude = 16 + index * 0.0001;
		const time = new Date(Date.UTC(2026, 8, 5, 8, 0, index * 20)).toISOString();
		return `<trkpt lat="43" lon="${longitude}"><time>${time}</time></trkpt>`;
	}).join('');
	return `<?xml version="1.0"?><gpx creator="Orca App" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Stor etappe</name><trkseg>${points}</trkseg></trk></gpx>`;
}

test('persists daily details and manages journey legs without mobile overflow', async ({
	page
}) => {
	await login(page);
	await page.goto('/logbook');
	const addButton = page.getByRole('button', { name: 'Ny etappe' });
	await expect(addButton).toBeEnabled();

	const destination = `Villa ${crypto.randomUUID()}`;
	const destinationInput = page.getByRole('combobox', { name: 'Dagens destinasjon' });
	await destinationInput.fill(destination);
	await destinationInput.blur();
	const weather = page.getByRole('textbox', { name: 'Vær og vind' });
	await weather.fill('Sol, 5 m/s nordvest');
	await weather.blur();
	await page.reload();
	await expect(addButton).toBeEnabled();
	await expect(page.getByRole('combobox', { name: 'Dagens destinasjon' })).toHaveValue(destination);
	await expect(page.getByRole('textbox', { name: 'Vær og vind' })).toHaveValue(
		'Sol, 5 m/s nordvest'
	);

	const arrival = `Havn ${crypto.randomUUID()}`;
	await addButton.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('combobox', { name: 'Fra' })).toHaveCount(0);
	await dialog.locator('input[type="file"]').setInputFiles({
		name: 'orca-etappe.gpx',
		mimeType: 'application/gpx+xml',
		buffer: Buffer.from(gpx)
	});
	await expect(dialog.getByRole('combobox', { name: 'Fra' })).toBeVisible();
	await dialog.getByRole('combobox', { name: 'Fra' }).fill('Split');
	await dialog.getByRole('combobox', { name: 'Til' }).fill(arrival);
	await expect(dialog.getByRole('textbox', { name: 'Avgang' })).toHaveAttribute('readonly', '');
	await expect(dialog.getByRole('textbox', { name: 'Ankomst' })).toHaveAttribute('readonly', '');
	await expect(dialog.getByRole('spinbutton', { name: 'Nautiske mil' })).toHaveAttribute(
		'readonly',
		''
	);
	await dialog.getByRole('spinbutton', { name: 'Seiling, minutter' }).fill('150');
	await dialog.getByRole('spinbutton', { name: 'Motor, minutter' }).fill('60');
	await dialog.getByRole('combobox', { name: 'Fortøyning' }).selectOption('marina');
	await dialog.getByRole('button', { name: 'Lagre etappe' }).click();

	const row = page.locator('article', { hasText: arrival });
	await expect(row).toBeVisible();
	await expect(row.getByText('orca-etappe.gpx')).toBeVisible();
	await expect(row.getByText(/GPX lagret|Venter på opplasting/)).toBeVisible();
	await expect(page.getByRole('button', { name: /last ned/i })).toHaveCount(0);
	await expect(row.getByText('Seil 2 t 30 min')).toBeVisible();
	await row.getByRole('button', { name: 'Rediger etappe' }).click();
	const editDialog = page.getByRole('dialog');
	await expect(editDialog.getByRole('heading', { name: 'Rediger etappe' })).toBeVisible();
	await editDialog.getByRole('spinbutton', { name: 'Motor, minutter' }).fill('75');
	await editDialog.getByRole('button', { name: 'Lagre endringer' }).click();
	await expect(row.getByText('Motor 1 t 15 min')).toBeVisible();
	await page.getByRole('button', { name: `Bruk ${arrival} som dagens destinasjon` }).click();
	await expect(page.getByRole('combobox', { name: 'Dagens destinasjon' })).toHaveValue(arrival);

	await page.reload();
	await expect(page.locator('article', { hasText: arrival })).toBeVisible();
	await page
		.locator('article', { hasText: arrival })
		.getByRole('button', { name: 'Slett etappe' })
		.click();
	await expect(page.locator('article', { hasText: arrival })).toHaveCount(0);

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
test('offers every nautical map point as a destination', async ({ page }) => {
	const sourceStyles = [
		{
			key: 'source-style-anchor',
			iconCode: '1623',
			symbol: 'anchorage',
			label: 'Ankerplasser og fortøyninger',
			color: '#087f8c'
		},
		{
			key: 'source-style-buoy',
			iconCode: '1563',
			symbol: 'buoy-field',
			label: 'Bøyefelt',
			color: '#d64545'
		},
		{
			key: 'source-style-marina',
			iconCode: '1681',
			symbol: 'marina',
			label: 'Marinaer og havner',
			color: '#2563a8'
		},
		{
			key: 'source-style-restaurant',
			iconCode: '1577',
			symbol: 'restaurant',
			label: 'Restauranter',
			color: '#9a5b3f'
		},
		{
			key: 'source-style-bar',
			iconCode: '1517',
			symbol: 'bar',
			label: 'Barer',
			color: '#d15f45'
		}
	].map((style) => ({
		...style,
		iconHref: '',
		count: 1
	}));
	const destinationFeatures = Array.from({ length: 10 }, (_value, index) => ({
		type: 'Feature',
		id: `destination-${index}`,
		geometry: { type: 'Point', coordinates: [16 + index / 100, 43 + index / 100] },
		properties: {
			title: `Fortøyning ${String(index + 1).padStart(2, '0')}`,
			description: '',
			snippet: '',
			address: '',
			layerId: 'layer',
			layerName: 'Anker, bøye og marina',
			layerPath: ['Anker, bøye og marina'],
			extendedData: {},
			style: {},
			sourceStyleKey: sourceStyles[index % 3]?.key
		}
	}));
	const excludedFeatures = ['restaurant', 'bar'].map((symbol, index) => ({
		type: 'Feature',
		id: `excluded-${symbol}`,
		geometry: { type: 'Point', coordinates: [16.5 + index / 100, 43.5] },
		properties: {
			title: symbol === 'restaurant' ? 'Konoba uten fortøyning' : 'Strandbar',
			description: '',
			snippet: '',
			address: '',
			layerId: 'layer',
			layerName: 'Dag 1',
			layerPath: ['Dag 1'],
			extendedData: {},
			style: {},
			sourceStyleKey: sourceStyles.find((style) => style.symbol === symbol)?.key
		}
	}));
	const snapshot = {
		version: 1,
		type: 'FeatureCollection',
		title: 'Test map',
		description: '',
		fetchedAt: '2026-08-21T10:00:00.000Z',
		sourceHash: 'destination-test',
		bounds: [16, 43, 17, 44],
		layers: [],
		sourceStyles,
		features: [...destinationFeatures, ...excludedFeatures]
	};
	await page.route(/\/api\/map$/, async (route) => {
		await route.fulfill({ json: { snapshot, stale: false, refreshing: false } });
	});
	const loginResponse = await page.request.post('/api/auth/login', {
		data: { password: 'test-password' }
	});
	expect(loginResponse.ok()).toBe(true);
	const mapResponsePromise = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/map'
	);
	await page.goto('/logbook');
	const mapResponse = await mapResponsePromise;
	expect((await mapResponse.json()).snapshot.sourceHash).toBe('destination-test');
	await page.getByRole('combobox', { name: 'Velg dag' }).selectOption({ index: 18 });
	const destination = page.getByRole('combobox', { name: 'Dagens destinasjon' });
	const destinationList = page.getByRole('listbox');
	await destination.fill('Fortøyning');
	await expect(destinationList.getByRole('option')).toHaveCount(10);
	await expect(destinationList.getByRole('option', { name: 'Konoba uten fortøyning' })).toHaveCount(
		0
	);
	await expect(destinationList.getByRole('option', { name: 'Strandbar' })).toHaveCount(0);
	await destinationList
		.locator('button')
		.filter({ hasText: /^Fortøyning 10$/ })
		.click();
	await expect(destination).toHaveValue('Fortøyning 10');
});

test('archives GPX files above the adapter default byte limit', async ({ page }) => {
	await login(page);
	const body = largeGpx(7_500);
	expect(Buffer.byteLength(body)).toBeGreaterThan(512 * 1_024);
	const id = crypto.randomUUID();
	const result = await page.evaluate(
		async ({ uploadId, xml }): Promise<{ status: number; retrieved: string }> => {
			const params = new URLSearchParams({
				legKey: 'logbook:d0:leg:large-adapter-test',
				filename: 'large-orca.gpx',
				clientId: 'adapter-test'
			});
			const uploaded = await fetch(`/api/logbook/gpx/${uploadId}?${params}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/gpx+xml' },
				body: xml
			});
			const retrieved = await fetch(`/api/logbook/gpx/${uploadId}`);
			return { status: uploaded.status, retrieved: await retrieved.text() };
		},
		{ uploadId: id, xml: body }
	);

	expect(result.status).toBe(201);
	expect(result.retrieved).toBe(body);
});
