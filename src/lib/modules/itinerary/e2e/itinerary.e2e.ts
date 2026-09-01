import { expect, type Locator, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
	await page.goto('/t/testreise/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

async function fillEndpoint(
	group: Locator,
	input: { place: string; code?: string; dateTime: string; timeZone?: string }
): Promise<void> {
	await group
		.getByRole('combobox', { name: input.code === undefined ? 'Sted' : 'Flyplass' })
		.fill(input.place);
	await group.locator('input[type="datetime-local"]').fill(input.dateTime);
	if (input.code !== undefined) await group.getByRole('textbox', { name: 'Kode' }).fill(input.code);
	if (input.timeZone) {
		await group.getByText('Tidssone og detaljer').click();
		await group.getByRole('button').filter({ hasText: 'GMT' }).click();
		const picker = group.getByRole('dialog', { name: 'Velg tidssone' });
		await picker.getByRole('textbox', { name: 'Søk etter tidssone' }).fill(input.timeZone);
		await picker.getByRole('button').filter({ hasText: input.timeZone }).click();
	}
}

async function addFlightLeg(
	dialog: Locator,
	index: number,
	flight: {
		number: string;
		from: string;
		fromCode: string;
		fromTime: string;
		fromZone: string;
		to: string;
		toCode: string;
		toTime: string;
		toZone: string;
	}
): Promise<void> {
	const leg = dialog.locator(`[data-flight-leg="${index}"]`);
	await leg.getByRole('textbox', { name: 'Flightnummer' }).fill(flight.number);
	await leg.locator('input[type="date"]').fill(flight.fromTime.slice(0, 10));
	await leg.getByRole('button', { name: 'Hent flydata' }).click();
	await expect(leg.getByText(/ikke konfigurert/)).toBeVisible();
	await fillEndpoint(leg.getByRole('group', { name: 'Fra' }), {
		place: flight.from,
		code: flight.fromCode,
		dateTime: flight.fromTime,
		timeZone: flight.fromZone
	});
	await fillEndpoint(leg.getByRole('group', { name: 'Til' }), {
		place: flight.to,
		code: flight.toCode,
		dateTime: flight.toTime,
		timeZone: flight.toZone
	});
}

test.use({ viewport: { width: 390, height: 844 } });

test('keeps manual flight edits when a pending lookup is cancelled', async ({ page }) => {
	let releaseLookup: (() => void) | undefined;
	await page.route('**/api/itinerary/flights/lookup', async (route) => {
		await new Promise<void>((resolve) => {
			releaseLookup = resolve;
		});
		await route.fulfill({
			json: {
				provider: 'flightaware',
				candidates: [
					{
						providerFlightId: 'delayed-flight',
						flightNumber: 'SK1461',
						operator: 'Stale airline',
						status: 'planned',
						from: {
							locationName: 'Oslo lufthavn',
							locationCode: 'OSL',
							localDateTime: '2027-06-01T08:00',
							timeZone: 'Europe/Oslo',
							instant: '2027-06-01T06:00:00.000Z',
							terminal: '',
							gate: '',
							platform: ''
						},
						to: {
							locationName: 'København',
							locationCode: 'CPH',
							localDateTime: '2027-06-01T09:10',
							timeZone: 'Europe/Copenhagen',
							instant: '2027-06-01T07:10:00.000Z',
							terminal: '',
							gate: '',
							platform: ''
						},
						scheduledFrom: '2027-06-01T06:00:00.000Z',
						scheduledTo: '2027-06-01T07:10:00.000Z'
					}
				]
			}
		});
	});
	await login(page);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Reiseplan' }).click();
	await page.getByRole('button', { name: 'Legg til plan' }).click();
	await page
		.getByRole('dialog', { name: 'Hva vil du legge til?' })
		.getByRole('button', { name: /^Fly/ })
		.click();
	const editor = page.getByRole('dialog', { name: 'Ny fly' });
	await editor.getByRole('textbox', { name: 'Flightnummer' }).fill('SK1461');
	await editor.locator('input[type="date"]').fill('2027-06-01');
	await editor.getByRole('button', { name: 'Hent flydata' }).click();
	await expect(editor.getByRole('button', { name: 'Henter …' })).toBeVisible();
	await editor.getByRole('button', { name: 'Fyll inn eller korriger manuelt' }).click();
	const operator = editor.getByRole('textbox', { name: 'Flyselskap' });
	await operator.fill('Manuelt flyselskap');
	releaseLookup?.();
	await expect(operator).toHaveValue('Manuelt flyselskap');
	await expect(editor.getByRole('button', { name: 'Skjul manuelle detaljer' })).toBeVisible();
});

test('builds simplified flight and accommodation timelines without mobile overflow', async ({
	page
}) => {
	await page.route(/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?.*/, async (route) => {
		const callback = new URL(route.request().url()).searchParams.get('callback');
		await route.fulfill({
			contentType: 'application/javascript',
			body: `
				class TestAutocompleteSessionToken {}
				class TestPlace {
					async fetchFields() {
						this.displayName = 'Testflyplass';
						this.formattedAddress = 'Testgata 1, Testbyen';
					}
				}
				const places = {
					AutocompleteSessionToken: TestAutocompleteSessionToken,
					AutocompleteSuggestion: {
						async fetchAutocompleteSuggestions(request) {
							if (request.language !== 'nb') throw new Error('INVALID_AUTOCOMPLETE_LANGUAGE');
							return { suggestions: [{ placePrediction: {
								text: { toString: () => 'Testflyplass, Testbyen' },
								toPlace: () => new TestPlace()
							} }] };
						}
					}
				};
				window.google = { maps: { importLibrary: async () => places } };
				window[${JSON.stringify(callback)}]?.();
			`
		});
	});
	await login(page);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Reiseplan' }).click();
	await expect(page.getByRole('heading', { name: 'Reiseplan', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Legg til plan' }).click();
	let chooser = page.getByRole('dialog', { name: 'Hva vil du legge til?' });
	await chooser.getByRole('button', { name: /^Fly/ }).click();
	let editor = page.getByRole('dialog', { name: 'Ny fly' });
	await expect(editor.getByRole('textbox', { name: 'Navn' })).toHaveCount(0);
	await expect(editor.getByRole('button', { name: 'Ada' })).toHaveAttribute('aria-pressed', 'true');
	await editor.getByText('Bestilling og notater').click();
	await editor.getByRole('textbox', { name: 'Referanse' }).fill('ABC123');
	await addFlightLeg(editor, 1, {
		number: 'SK1461',
		from: 'Oslo lufthavn',
		fromCode: 'OSL',
		fromTime: '2027-06-01T08:00',
		fromZone: 'Europe/Oslo',
		to: 'København',
		toCode: 'CPH',
		toTime: '2027-06-01T09:10',
		toZone: 'Europe/Copenhagen'
	});
	await editor.getByRole('button', { name: 'Legg til mellomlanding' }).click();
	await addFlightLeg(editor, 2, {
		number: 'SK973',
		from: 'København',
		fromCode: 'CPH',
		fromTime: '2027-06-01T10:45',
		fromZone: 'Europe/Copenhagen',
		to: 'Bangkok',
		toCode: 'BKK',
		toTime: '2027-06-02T05:55',
		toZone: 'Asia/Bangkok'
	});
	await editor.getByRole('button', { name: 'Lagre', exact: true }).click();
	await expect(editor).not.toBeVisible();

	await expect(page.locator('article', { hasText: 'SK1461' })).toHaveCount(1);
	await expect(page.locator('article', { hasText: 'SK973' })).toHaveCount(1);
	await expect(page.getByText('1 t 35 min overgang')).toBeVisible();
	await expect(page.getByText('GMT+2').first()).toBeVisible();
	await expect(page.getByText('Europe/Oslo')).toHaveCount(0);
	await expect(page.getByText('OSL → BKK')).toHaveCount(0);

	await page.getByRole('button', { name: 'Filtrer reiseplan' }).click();
	const filter = page.getByRole('dialog', { name: 'Vis i tidslinjen' });
	await filter.getByRole('button', { name: 'Fly', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Filtrer reiseplan' })).toContainText('Fly');

	await page.getByRole('button', { name: 'Legg til', exact: true }).click();
	chooser = page.getByRole('dialog', { name: 'Hva vil du legge til?' });
	await chooser.getByRole('button', { name: /^Overnatting/ }).click();
	editor = page.getByRole('dialog', { name: 'Ny overnatting' });
	await editor.getByRole('textbox', { name: 'Navn på overnatting' }).fill('Hotel Test');
	await editor.getByRole('combobox', { name: 'Sted' }).fill('Testbyen');
	await editor.getByRole('button', { name: 'Testflyplass, Testbyen' }).click();
	await expect(editor.getByRole('combobox', { name: 'Sted' })).toHaveValue(
		'Testflyplass, Testgata 1, Testbyen'
	);
	await editor.locator('input[type="datetime-local"]').nth(0).fill('2027-06-02T15:00');
	await editor.locator('input[type="datetime-local"]').nth(1).fill('2027-06-04T11:00');
	await editor.getByRole('button', { name: 'Lagre', exact: true }).click();
	await expect(editor).not.toBeVisible();

	await page.getByRole('button', { name: 'Legg til', exact: true }).click();
	chooser = page.getByRole('dialog', { name: 'Hva vil du legge til?' });
	await chooser.getByRole('button', { name: /^Transport/ }).click();
	editor = page.getByRole('dialog', { name: 'Ny transport' });
	await expect(editor.getByRole('combobox', { name: 'Transportmiddel' })).toHaveValue('taxi');
	await expect(editor.getByRole('textbox', { name: 'Taxiselskap (valgfritt)' })).toBeVisible();
	await expect(editor.getByRole('textbox', { name: 'Rutenummer (valgfritt)' })).toHaveCount(0);
	await editor.getByRole('combobox', { name: 'Transportmiddel' }).selectOption('train');
	await expect(editor.getByRole('textbox', { name: 'Rutenummer (valgfritt)' })).toBeVisible();
	await expect(editor.getByRole('group', { name: 'Fra' })).toBeVisible();
	await expect(editor.getByRole('group', { name: 'Til' })).toBeVisible();
	await editor.getByRole('combobox', { name: 'Transportmiddel' }).selectOption('taxi');
	await editor.getByRole('textbox', { name: 'Taxiselskap (valgfritt)' }).fill('Testtaxi');
	await editor
		.getByRole('combobox', { name: 'Hentested' })
		.fill('Lang testadresse 123, 5000 Testbyen, Norge');
	await editor
		.getByRole('combobox', { name: 'Destinasjon' })
		.fill('Testbyen sentralstasjon, Plattformveien 456, 5001 Testbyen, Norge');
	await editor.locator('input[type="datetime-local"]').fill('2027-06-02T07:30');
	await editor.getByRole('button', { name: 'Lagre', exact: true }).click();
	await expect(editor).not.toBeVisible();

	await page.getByRole('button', { name: 'Legg til', exact: true }).click();
	chooser = page.getByRole('dialog', { name: 'Hva vil du legge til?' });
	await chooser.getByRole('button', { name: /^Leie/ }).click();
	editor = page.getByRole('dialog', { name: 'Ny leie' });
	await editor.getByRole('textbox', { name: 'Utleier / utleieselskap' }).fill('Testutleie');
	await editor.getByRole('combobox', { name: 'Type' }).selectOption('boat');
	await fillEndpoint(editor.getByRole('group', { name: 'Henting' }), {
		place: 'Testhavn',
		dateTime: '2027-06-03T09:00'
	});
	await fillEndpoint(editor.getByRole('group', { name: 'Levering' }), {
		place: 'Testhavn',
		dateTime: '2027-06-03T18:00'
	});
	await editor.getByRole('button', { name: 'Lagre', exact: true }).click();
	await expect(editor).not.toBeVisible();

	await page.getByRole('button', { name: 'Filtrer reiseplan' }).click();
	await page
		.getByRole('dialog', { name: 'Vis i tidslinjen' })
		.getByRole('button', { name: 'Alle planer' })
		.click();
	const stayCards = page
		.locator('article', { hasText: 'Hotel Test' })
		.filter({ has: page.locator('.lucide-bed-double') });
	await expect(stayCards).toHaveCount(2);
	const taxiCard = page.locator('article', { hasText: 'Testtaxi' });
	const taxiRoute = taxiCard.locator('[data-transport-route]');
	await expect(taxiRoute.locator('[data-transport-stop="from"]')).toContainText('Fra');
	await expect(taxiRoute.locator('[data-transport-stop="from"]')).toContainText(
		'Lang testadresse 123, 5000 Testbyen, Norge'
	);
	await expect(taxiRoute.locator('[data-transport-stop="to"]')).toContainText('Til');
	await expect(taxiRoute.locator('[data-transport-stop="to"]')).toContainText(
		'Testbyen sentralstasjon, Plattformveien 456, 5001 Testbyen, Norge'
	);
	const boatCards = page.locator('article', { hasText: 'Testutleie' });
	await expect(boatCards).toHaveCount(2);
	await expect(boatCards.first().locator('.lucide-sailboat').first()).toBeVisible();
	await expect(boatCards.first().getByText('Ada')).toHaveCount(0);

	await page.reload();
	await expect(page.locator('article', { hasText: 'SK1461' })).toHaveCount(1);
	await expect(stayCards).toHaveCount(2);
	await expect(page.locator('article', { hasText: 'Testutleie' })).toHaveCount(2);
	await expect(page.locator('[data-itinerary-timeline]')).toHaveCount(1);
	await expect(page.locator('[data-timeline-date]')).toHaveCount(4);
	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
