import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 320, height: 844 } });

test('shares and rates a destination suggestion offline', async ({ context, page }) => {
	await page.goto('/t/testreise/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Neste tur' }).click();

	await expect(page.getByRole('heading', { name: 'Hvor drar vi?', level: 1 })).toBeVisible();
	await page.getByRole('button', { name: 'Nytt forslag' }).click();
	await page.getByLabel('Hvor?').fill('Lofoten');
	await page.getByLabel('Hvorfor?').fill('Fjell, hav og god mat.');
	await page
		.getByRole('dialog', { name: 'Nytt reiseforslag' })
		.getByRole('button', { name: 'Legg til forslag' })
		.click();
	await expect(page.getByRole('heading', { name: 'Lofoten', level: 3 })).toBeVisible();

	await context.setOffline(true);
	await page.getByRole('button', { name: '5 stjerner' }).click();
	await expect(page.getByText('1 vurdering')).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Lofoten', level: 3 })).toBeVisible();

	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect
		.poll(
			async () => {
				const response = await page.request.get('/api/next-trip');
				const data = (await response.json()) as {
					suggestions?: Array<{ destination: string; ratings: Array<{ score: number }> }>;
				};
				return data.suggestions?.some(
					(suggestion) =>
						suggestion.destination === 'Lofoten' &&
						suggestion.ratings.some((rating) => rating.score === 5)
				);
			},
			{ timeout: 15_000 }
		)
		.toBe(true);
	await expect(page.getByText('Synkronisert')).toBeVisible();
	await expect(page.getByText('Kunne ikke lagre endringen')).toHaveCount(0);
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Slett Lofoten' }).click();
	await expect(page.getByRole('heading', { name: 'Lofoten', level: 3 })).toHaveCount(0);
	await expect(page.getByText('Synkronisert')).toBeVisible();
	await expect
		.poll(async () => {
			const response = await page.request.get('/api/next-trip');
			const data = (await response.json()) as { suggestions?: Array<{ destination: string }> };
			return data.suggestions?.some((suggestion) => suggestion.destination === 'Lofoten');
		})
		.toBe(false);

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
