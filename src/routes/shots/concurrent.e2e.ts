import { expect, type Page, test } from '@playwright/test';

async function loginDigest(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
	await page.goto('/shots?mode=digest');
	await expect(page.getByRole('heading', { name: 'Kontroll før kvelden' })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('Synkronisert');
}

async function addVideo(page: Page, description: string, camera: string): Promise<void> {
	await page.getByRole('button', { name: 'Legg til' }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('textbox', { name: 'Beskrivelse' }).fill(description);
	await dialog.getByRole('combobox', { name: 'Kamera' }).selectOption(camera);
	await dialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(page.getByText(description)).toBeVisible();
	await expect(page.getByRole('status')).toHaveText(/Uten nett · 1 venter/);
}

test('merges rows created by two offline clients', async ({ browser }) => {
	const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const firstPage = await firstContext.newPage();
	const secondPage = await secondContext.newPage();
	const firstDescription = `Første klient ${crypto.randomUUID()}`;
	const secondDescription = `Andre klient ${crypto.randomUUID()}`;

	try {
		await loginDigest(firstPage);
		await loginDigest(secondPage);
		await firstContext.setOffline(true);
		await secondContext.setOffline(true);

		await addVideo(firstPage, firstDescription, 'Osmo Action 4');
		await addVideo(secondPage, secondDescription, 'Pocket 4');

		await firstContext.setOffline(false);
		await expect(firstPage.getByRole('status')).toHaveText('Synkronisert', {
			timeout: 15_000
		});
		await secondContext.setOffline(false);
		await expect(secondPage.getByRole('status')).toHaveText('Synkronisert', {
			timeout: 15_000
		});
		await expect(secondPage.getByText(firstDescription)).toBeVisible();
		await expect(secondPage.getByText(secondDescription)).toBeVisible();

		await firstPage.reload();
		await expect(firstPage.getByRole('status')).toHaveText('Synkronisert', {
			timeout: 15_000
		});
		await expect(firstPage.getByText(firstDescription)).toBeVisible();
		await expect(firstPage.getByText(secondDescription)).toBeVisible();

		const serverDescriptions = await firstPage.evaluate(async (): Promise<string[]> => {
			const response = await fetch('/api/state?since=0');
			const body = (await response.json()) as {
				entries: Array<{ key: string; value: { description?: unknown } }>;
			};
			return body.entries
				.filter((entry) => entry.key.startsWith('digest:d'))
				.map((entry) => entry.value.description)
				.filter((value): value is string => typeof value === 'string');
		});
		expect(serverDescriptions).toEqual(
			expect.arrayContaining([firstDescription, secondDescription])
		);
	} finally {
		await firstContext.close();
		await secondContext.close();
	}
});
