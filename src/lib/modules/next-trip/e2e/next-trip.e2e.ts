import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 320, height: 844 } });

test('keeps suggestions readable and disables changes offline', async ({ context, page }) => {
	test.setTimeout(60_000);
	await page.goto('/t/testreise/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Neste tur' }).click();

	await expect(page.getByRole('heading', { name: 'Hvor drar vi?', level: 1 })).toBeVisible();
	await page.getByRole('button', { name: 'Nytt forslag' }).click();
	await page.getByLabel('Hvor?').fill('Lofoten');
	await page.getByLabel('Hvorfor?').fill('Fjell, hav og god mat: example.no/lofoten');
	await page.getByLabel('Lenke').fill('https://www.visitnorway.com/places-to-go/northern-norway/');
	await page
		.getByRole('dialog', { name: 'Nytt reiseforslag' })
		.getByRole('button', { name: 'Legg til forslag' })
		.click();
	await expect(page.getByRole('heading', { name: 'Lofoten', level: 3 })).toBeVisible();
	const suggestionCard = page.locator('article').filter({
		has: page.getByRole('heading', { name: 'Lofoten', level: 3 })
	});
	const actionMenu = suggestionCard.locator('details');
	const actionMenuButton = suggestionCard.locator('summary[aria-label="Flere valg for Lofoten"]');

	await actionMenuButton.click();
	await expect(actionMenu).toHaveAttribute('open', '');
	await actionMenuButton.click();
	await expect(actionMenu).not.toHaveAttribute('open', '');

	await actionMenuButton.click();
	await page.getByRole('heading', { name: 'Forslag', level: 2 }).click();
	await expect(actionMenu).not.toHaveAttribute('open', '');

	await actionMenuButton.click();
	await suggestionCard.getByRole('button', { name: 'Rediger' }).click();
	await expect(actionMenu).not.toHaveAttribute('open', '');
	const editor = page.getByRole('dialog', { name: 'Rediger reiseforslag' });
	await expect(editor).toBeVisible();
	await editor.getByLabel('Hvor?').fill('Lofoten og Vesterålen');
	await editor.getByRole('button', { name: 'Lagre endringer' }).click();
	await expect(
		page.getByRole('heading', { name: 'Lofoten og Vesterålen', level: 3 })
	).toBeVisible();

	const editedCard = page.locator('article').filter({
		has: page.getByRole('heading', { name: 'Lofoten og Vesterålen', level: 3 })
	});
	await expect(editedCard.getByRole('link', { name: 'example.no/lofoten' })).toHaveAttribute(
		'href',
		'http://example.no/lofoten'
	);
	await expect(
		editedCard.getByRole('link', { name: 'Åpne visitnorway.com i ny fane' })
	).toHaveAttribute('href', 'https://www.visitnorway.com/places-to-go/northern-norway/');
	const fiveStarRating = editedCard.getByRole('button', { name: '5 stjerner' });
	await fiveStarRating.click();
	await expect(fiveStarRating).toHaveAttribute('aria-pressed', 'true');
	await expect(editedCard.getByText('1 vurdering', { exact: true })).toBeVisible();
	await fiveStarRating.click();
	await expect(fiveStarRating).toHaveAttribute('aria-pressed', 'false');
	await expect(editedCard.getByText('0 vurderinger', { exact: true })).toBeVisible();

	await editedCard.getByRole('button', { name: '0 kommentarer' }).click();
	await editedCard
		.getByPlaceholder('Skriv en kommentar')
		.fill('Jeg stemmer for! Se example.no/rute');
	await editedCard.getByRole('button', { name: 'Legg til kommentar' }).click();
	await expect(editedCard.getByRole('link', { name: 'example.no/rute' })).toHaveAttribute(
		'href',
		'http://example.no/rute'
	);

	const commentEditButton = editedCard.getByRole('button', { name: /Rediger kommentar fra/ });
	await commentEditButton.click();
	const commentEditor = editedCard.getByLabel(/Rediger kommentar fra/);
	await commentEditor.fill('Endret kommentar med https://example.com/rute');
	await editedCard.getByRole('button', { name: 'Lagre' }).click();
	await expect(editedCard.getByText('Redigert')).toBeVisible();
	await expect(editedCard.getByRole('link', { name: 'https://example.com/rute' })).toHaveAttribute(
		'href',
		'https://example.com/rute'
	);

	await page.reload();
	const persistedCard = page.locator('article').filter({
		has: page.getByRole('heading', { name: 'Lofoten og Vesterålen', level: 3 })
	});
	await expect(persistedCard.getByRole('button', { name: '5 stjerner' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(persistedCard.getByText('0 vurderinger', { exact: true })).toBeVisible();
	await persistedCard.getByRole('button', { name: '1 kommentar' }).click();
	await expect(persistedCard.getByText('Endret kommentar med')).toBeVisible();

	await context.setOffline(true);
	await page.reload();
	await expect(
		page.getByRole('heading', { name: 'Lofoten og Vesterålen', level: 3 })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Nytt forslag' })).toBeDisabled();
	await expect(page.getByRole('button', { name: '5 stjerner' })).toBeDisabled();
	await page.locator('summary[aria-label="Flere valg for Lofoten og Vesterålen"]').click();
	await expect(page.getByRole('button', { name: 'Slett' })).toBeDisabled();
	await page.getByRole('button', { name: '1 kommentar' }).click();
	await expect(page.getByPlaceholder('Skriv en kommentar')).toBeDisabled();
	await expect(page.getByRole('button', { name: /Rediger kommentar fra/ })).toBeDisabled();

	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByText('Synkronisert')).toBeVisible();
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: /Slett kommentar fra/ }).click();
	await expect(page.getByText('Endret kommentar med')).toHaveCount(0);
	await page.locator('summary[aria-label="Flere valg for Lofoten og Vesterålen"]').click();
	await page.getByRole('button', { name: 'Slett' }).click();
	await expect(page.getByRole('heading', { name: 'Lofoten og Vesterålen', level: 3 })).toHaveCount(
		0
	);
	await expect(page.getByText('Synkronisert')).toBeVisible();
	await expect
		.poll(async () => {
			const response = await page.request.get('/api/next-trip');
			const data = (await response.json()) as { suggestions?: Array<{ destination: string }> };
			return data.suggestions?.some(
				(suggestion) => suggestion.destination === 'Lofoten og Vesterålen'
			);
		})
		.toBe(false);

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
