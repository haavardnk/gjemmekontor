import { expect, type Locator, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 320, height: 844 } });

async function login(page: Page): Promise<void> {
	await page.goto('/t/testreise/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

async function openPlanning(page: Page): Promise<void> {
	await login(page);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Planlegging' }).click();
	await expect(page.getByRole('heading', { name: 'Idéer for turen', level: 1 })).toBeVisible();
}

async function addCategory(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: 'Ny kategori' }).click();
	const dialog = page.getByRole('dialog', { name: 'Ny kategori' });
	await dialog.getByLabel('Navn').fill(name);
	await dialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

async function addCard(page: Page, section: string, title: string): Promise<void> {
	await page.getByRole('button', { name: `Nytt kort i ${section}` }).click();
	const editor = page.getByRole('dialog', { name: 'Nytt kort' });
	await editor.getByLabel('Tittel').fill(title);
	await editor.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByRole('heading', { name: title, level: 3 })).toBeVisible();
}

async function deleteCard(page: Page, title: string): Promise<void> {
	await page.getByRole('button', { name: title, exact: true }).click();
	await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Slett' }).click();
	await expect(page.getByRole('heading', { name: title, level: 3 })).toHaveCount(0);
}

async function deleteCategory(page: Page, name: string): Promise<void> {
	await page.locator(`summary[aria-label="Valg for ${name}"]`).click();
	await page.getByRole('button', { name: 'Slett' }).click();
	await expect(page.getByRole('heading', { name, level: 2 })).toHaveCount(0);
}

function cardTitles(page: Page, section: string): Locator {
	return page.getByRole('list', { name: `Kort i ${section}` }).getByRole('heading', { level: 3 });
}

test('collects ideas in categories and keeps them readable offline', async ({ context, page }) => {
	test.setTimeout(60_000);
	await openPlanning(page);

	await page.getByRole('button', { name: 'Ny kategori' }).click();
	const categoryDialog = page.getByRole('dialog', { name: 'Ny kategori' });
	await categoryDialog.getByLabel('Navn').fill('Mat');
	await categoryDialog.locator('label', { has: page.getByLabel('Gul') }).click();
	await expect(categoryDialog.getByLabel('Gul')).toBeChecked();
	await categoryDialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByRole('heading', { name: 'Mat', level: 2 })).toBeVisible();

	await page.getByRole('button', { name: 'Nytt kort i Mat' }).click();
	const editor = page.getByRole('dialog', { name: 'Nytt kort' });
	await editor.getByLabel('Tittel').fill('Fiskesuppe i Bergen');
	await editor.getByLabel('Notat').fill('Anbefalt på example.no/suppe');
	await editor.getByLabel('Sted').fill('Fisketorget');
	await editor.getByLabel('Nytt punkt').fill('Bestill bord');
	await editor.getByLabel('Nytt punkt').press('Enter');
	await editor.getByLabel('Nytt punkt').fill('Sjekk åpningstider');
	await editor.getByRole('button', { name: 'Legg til punkt' }).click();
	await editor.getByRole('button', { name: 'Lagre' }).click();
	await expect(editor).toHaveCount(0);

	await page.getByRole('button', { name: 'Nytt kort', exact: true }).click();
	await editor.getByLabel('Tittel').fill('Kajakktur');
	await editor.getByLabel('Ny lenke').fill('example.invalid/kajakk');
	await editor.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByRole('heading', { name: 'Usortert', level: 2 })).toBeVisible();

	const soupTile = page
		.getByRole('listitem')
		.filter({ has: page.getByText('Fiskesuppe i Bergen') });
	await expect(soupTile).toContainText('0/2');
	await page.getByRole('button', { name: 'Fiskesuppe i Bergen', exact: true }).click();
	const detail = page.getByRole('dialog', { name: 'Fiskesuppe i Bergen' });
	await expect(detail.getByRole('link', { name: 'example.no/suppe' })).toHaveAttribute(
		'href',
		'http://example.no/suppe'
	);
	await expect(detail.getByRole('link', { name: 'Fisketorget' })).toHaveAttribute(
		'href',
		'https://www.google.com/maps/search/?api=1&query=Fisketorget'
	);
	await detail.getByRole('checkbox', { name: 'Bestill bord' }).check();
	await expect(detail.getByText('1/2')).toBeVisible();
	await detail.getByRole('button', { name: 'Lukk kortet' }).click();

	await page.getByRole('button', { name: 'Kajakktur', exact: true }).click();
	const kayakDetail = page.getByRole('dialog', { name: 'Kajakktur' });
	await expect(kayakDetail.getByRole('link', { name: 'example.invalid' })).toHaveAttribute(
		'href',
		'https://example.invalid/kajakk'
	);
	const retryPreview = kayakDetail.getByRole('button', { name: 'Prøv igjen' });
	await retryPreview.click();
	await expect(retryPreview).toBeVisible();
	await kayakDetail.getByLabel('Kategori').selectOption({ label: 'Mat' });
	await expect(page.getByRole('heading', { name: 'Usortert', level: 2 })).toHaveCount(0);
	await kayakDetail.getByRole('button', { name: 'Flytt kortet opp' }).click();
	await expect(cardTitles(page, 'Mat')).toHaveText(['Kajakktur', 'Fiskesuppe i Bergen']);
	await kayakDetail.getByRole('button', { name: 'Lukk kortet' }).click();

	await page.reload();
	await expect(cardTitles(page, 'Mat')).toHaveText(['Kajakktur', 'Fiskesuppe i Bergen']);
	await expect(soupTile).toContainText('1/2');

	await context.setOffline(true);
	await page.reload();
	await expect(cardTitles(page, 'Mat')).toHaveText(['Kajakktur', 'Fiskesuppe i Bergen']);
	await expect(page.getByRole('button', { name: 'Nytt kort', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Fiskesuppe i Bergen', exact: true }).click();
	await expect(detail.getByRole('checkbox', { name: 'Sjekk åpningstider' })).toBeDisabled();
	await expect(detail.getByRole('button', { name: 'Rediger' })).toBeDisabled();
	await detail.getByRole('button', { name: 'Lukk kortet' }).click();

	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByText('Synkronisert')).toBeVisible();
	page.on('dialog', (dialog) => dialog.accept());
	await deleteCategory(page, 'Mat');
	await expect(cardTitles(page, 'Usortert')).toHaveText(['Kajakktur', 'Fiskesuppe i Bergen']);

	await deleteCard(page, 'Kajakktur');
	await deleteCard(page, 'Fiskesuppe i Bergen');
	await expect(page.getByText('Ingen idéer ennå.', { exact: false })).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});

test.describe('on desktop', () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test('drags cards and categories into place', async ({ page }) => {
		test.setTimeout(60_000);
		await login(page);
		await page.goto('/planning');
		await addCategory(page, 'Overnatting');
		await addCategory(page, 'Aktiviteter');
		await addCard(page, 'Overnatting', 'Hytte');
		await addCard(page, 'Aktiviteter', 'Fjelltur');
		await addCard(page, 'Aktiviteter', 'Bading');

		await page
			.getByRole('button', { name: 'Dra kortet Hytte' })
			.dragTo(page.getByRole('listitem').filter({ has: page.getByText('Bading') }));
		await expect(cardTitles(page, 'Aktiviteter')).toHaveText(['Fjelltur', 'Hytte', 'Bading']);
		await expect(page.getByRole('list', { name: 'Kort i Overnatting' })).toHaveCount(0);

		await page
			.getByRole('button', { name: 'Dra kategorien Aktiviteter' })
			.dragTo(page.getByRole('region', { name: 'Overnatting' }));
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			'Aktiviteter',
			'Overnatting'
		]);

		await page.reload();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			'Aktiviteter',
			'Overnatting'
		]);
		await expect(cardTitles(page, 'Aktiviteter')).toHaveText(['Fjelltur', 'Hytte', 'Bading']);

		page.on('dialog', (dialog) => dialog.accept());
		await deleteCategory(page, 'Aktiviteter');
		await deleteCategory(page, 'Overnatting');
		for (const title of ['Fjelltur', 'Hytte', 'Bading']) await deleteCard(page, title);
	});
});
