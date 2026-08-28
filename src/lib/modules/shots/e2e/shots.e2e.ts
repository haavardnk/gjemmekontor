import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/t/kroatia-2026/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

test('persists daily shots and manages Digest rows without mobile overflow', async ({ page }) => {
	await login(page);
	await page.goto('/shots?mode=record');
	await page.getByRole('combobox', { name: 'Velg dag' }).selectOption('0');
	await expect(page.getByRole('heading', { name: 'Dagens scener' })).toBeVisible();
	const outboundTravel = page.locator('details', { hasText: 'Reisen til Kroatia' });
	await outboundTravel.locator('summary').click();
	await expect(outboundTravel.getByText('Odd, Lise og Oskar gjør seg klare hjemme.')).toBeVisible();
	await expect(
		outboundTravel.getByText('Håvard, Tina og Tomine gjør seg klare hjemme.')
	).toBeVisible();
	await expect(outboundTravel.getByText('A-roll', { exact: true }).first()).toBeVisible();
	await expect(outboundTravel.getByText('B-roll', { exact: true }).first()).toBeVisible();
	await expect(outboundTravel.getByText('Forslag: Insta360 X5').first()).toBeVisible();
	await expect(outboundTravel.getByText('Forslag: Pocket 4')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Lyd', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Bilder', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toHaveCount(0);
	const selectedDinner = page.locator('[data-selected-scenario-id="matInne"]');
	if ((await selectedDinner.count()) > 0) {
		await selectedDinner.locator('summary').click();
		await selectedDinner.getByRole('button', { name: 'Fjern fra dagen' }).click();
	}
	await expect(page.getByRole('heading', { name: 'Scenebank' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Seilas og havn' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Bading og aktivitet' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Mat og kveld' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Familie og turer' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vær og luft' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Generisk B-roll' })).toBeVisible();
	const bathingGroup = page.locator('[data-scene-group="Bading og aktivitet"]');
	await bathingGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scenario-id="morgenbad"]')).toBeVisible();
	await bathingGroup.locator(':scope > summary').click();
	const familyGroup = page.locator('[data-scene-group="Familie og turer"]');
	await familyGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scenario-id="hengekoye"]')).toBeVisible();
	await familyGroup.locator(':scope > summary').click();
	const bRollGroup = page.locator('[data-scene-group="Generisk B-roll"]');
	await bRollGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scenario-id="brollBat"]')).toBeVisible();
	await expect(page.locator('[data-scenario-id="brollBaby"]')).toBeVisible();
	await expect(page.locator('[data-scenario-id="brollVilla"]')).toBeVisible();
	const boatBroll = page.locator('[data-scenario-id="brollBat"]');
	await boatBroll.locator('summary').click();
	const syncResponse = page.waitForResponse((response) =>
		/^\/api\/trips\/[^/]+\/state$/.test(new URL(response.url()).pathname)
	);
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await syncResponse;
	await expect(bRollGroup).toHaveAttribute('open', '');
	await expect(boatBroll).toHaveAttribute('open', '');
	await boatBroll.locator('summary').click();
	await bRollGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scene-group][open]')).toHaveCount(0);
	await page.getByRole('searchbox', { name: 'Finn scene' }).fill('Catan');
	await expect(familyGroup).toHaveAttribute('open', '');
	await expect(page.locator('[data-scenario-id="catan"]')).toBeVisible();
	await page.getByRole('searchbox', { name: 'Finn scene' }).fill('');
	await expect(page.locator('[data-scene-group][open]')).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Dagens minne' })).toHaveCount(0);
	const mealGroup = page.locator('[data-scene-group="Mat og kveld"]');
	await mealGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scenario-id="mat"]')).toBeVisible();
	await expect(page.locator('[data-scenario-id="matInne"]')).toBeVisible();
	await expect(page.locator('[data-scenario-id="restaurant"]')).toBeVisible();
	const indoorDinner = page.locator('[data-scenario-id="matInne"]');
	await expect(indoorDinner).toBeVisible();
	await indoorDinner.locator('summary').click();
	await expect(indoorDinner.getByText('A-roll', { exact: true }).first()).toBeVisible();
	await expect(indoorDinner.getByText('B-roll', { exact: true }).first()).toBeVisible();
	await expect(indoorDinner.getByText(/Forslag: Pocket 4/).first()).toBeVisible();
	await indoorDinner.getByRole('button', { name: 'Legg til dagens scener' }).click();
	await expect(page.getByRole('heading', { name: 'Dagens scener' })).toBeVisible();
	await expect(page.locator('[data-selected-scenario-id="matInne"]')).toBeVisible();
	await expect(indoorDinner).toHaveCount(0);

	await page.reload();
	await expect(page.locator('[data-selected-scenario-id="matInne"]')).toBeVisible();

	await page.getByRole('tab', { name: 'Utvalg' }).click();
	await expect(page).toHaveURL(/\/shots\?mode=digest$/);
	await expect(page.getByRole('heading', { name: 'Kontroll før kvelden' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Lyd', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Bilder', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Kameraer tømt' })).toBeVisible();
	const pocketOffload = page.getByRole('checkbox', { name: 'Pocket 4' });
	await pocketOffload.check();
	await expect(pocketOffload).toBeChecked();
	const description = `Seiling ${crypto.randomUUID()}`;
	await page.getByRole('button', { name: 'Legg til' }).first().click();
	const dialog = page.getByRole('dialog');
	const labels = await dialog.locator('label').evaluateAll((elements) =>
		elements.map((element) => {
			const field = element.querySelector('input, select, textarea');
			const labelBox = element.getBoundingClientRect();
			const fieldBox = field?.getBoundingClientRect();
			return fieldBox
				? fieldBox.left >= labelBox.left && fieldBox.right <= labelBox.right + 1
				: false;
		})
	);
	expect(labels.every(Boolean)).toBe(true);
	await dialog.getByRole('textbox', { name: 'Beskrivelse' }).fill(description);
	await dialog.getByRole('combobox', { name: 'Kamera' }).selectOption('Håvard sin mobil');
	await dialog.getByRole('textbox', { name: /Filnavn/ }).fill('A001.mp4');
	await dialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByText(description)).toBeVisible();
	await expect(page.getByText('Håvard sin mobil · A001.mp4')).toBeVisible();

	await page.reload();
	const row = page.locator('article', { hasText: description });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Slett rad' }).click();
	await expect(row).toHaveCount(0);

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
