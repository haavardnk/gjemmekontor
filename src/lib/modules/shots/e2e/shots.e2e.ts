import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/t/testreise/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

test('persists daily shots and manages Digest rows without mobile overflow', async ({ page }) => {
	await login(page);
	await page.goto('/shots?mode=record');
	await page.getByRole('combobox', { name: 'Velg dag' }).selectOption('0');
	await expect(page.getByRole('heading', { name: 'Lyd', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Bilder', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Scenebank' })).toBeVisible();
	const generalGroup = page.locator('[data-scene-group="Generelle scener"]');
	await generalGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scenario-id="dagensHistorie"]')).toBeVisible();
	await expect(page.locator('[data-scenario-id="maltid"]')).toBeVisible();
	await expect(page.locator('[data-scenario-id="omgivelser"]')).toBeVisible();
	const story = page.locator('[data-scenario-id="dagensHistorie"]');
	await story.locator('summary').click();
	await expect(story.getByText('A-roll', { exact: true }).first()).toBeVisible();
	await expect(story.getByText('B-roll', { exact: true }).first()).toBeVisible();
	await expect(story.getByText('Forslag: Kamera').first()).toBeVisible();
	const syncResponse = page.waitForResponse((response) =>
		/^\/api\/trips\/[^/]+\/state$/.test(new URL(response.url()).pathname)
	);
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await syncResponse;
	await expect(generalGroup).toHaveAttribute('open', '');
	await expect(story).toHaveAttribute('open', '');
	await story.locator('summary').click();
	await generalGroup.locator(':scope > summary').click();
	await expect(page.locator('[data-scene-group][open]')).toHaveCount(0);
	await page.getByRole('searchbox', { name: 'Finn scene' }).fill('måltid');
	await expect(generalGroup).toHaveAttribute('open', '');
	await expect(page.locator('[data-scenario-id="maltid"]')).toBeVisible();
	await page.getByRole('searchbox', { name: 'Finn scene' }).fill('');
	await expect(page.locator('[data-scene-group][open]')).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Dagens minne' })).toHaveCount(0);
	await generalGroup.locator(':scope > summary').click();
	await story.locator('summary').click();
	await story.getByRole('button', { name: 'Legg til dagens scener' }).click();
	await expect(page.getByRole('heading', { name: 'Dagens scener' })).toBeVisible();
	await expect(page.locator('[data-selected-scenario-id="dagensHistorie"]')).toBeVisible();
	await expect(story).toHaveCount(0);

	await page.reload();
	await expect(page.locator('[data-selected-scenario-id="dagensHistorie"]')).toBeVisible();

	await page.getByRole('tab', { name: 'Utvalg' }).click();
	await expect(page).toHaveURL(/\/shots\?mode=digest$/);
	await expect(page.getByRole('heading', { name: 'Kontroll før kvelden' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Lyd', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Bilder', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Kameraer tømt' })).toBeVisible();
	const cameraOffload = page.getByRole('checkbox', { name: 'Kamera', exact: true });
	await cameraOffload.check();
	await expect(cameraOffload).toBeChecked();
	const description = `Testklipp ${crypto.randomUUID()}`;
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
	await dialog.getByRole('combobox', { name: 'Kamera' }).selectOption('Mobil');
	await dialog.getByRole('textbox', { name: /Filnavn/ }).fill('A001.mp4');
	await dialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByText(description)).toBeVisible();
	await expect(page.getByText('Mobil · A001.mp4')).toBeVisible();

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
