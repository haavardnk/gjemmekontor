import { expect, test } from '@playwright/test';

test('loads the authenticated app shell without a network connection', async ({
	context,
	page
}) => {
	await page.goto('/t/kroatia-2026/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
	await page.waitForFunction(async (): Promise<boolean> => {
		if (!navigator.serviceWorker.controller) return false;
		const keys = await caches.keys();
		for (const key of keys.filter((key) => key.startsWith('gjemmekontor-pages-'))) {
			const cache = await caches.open(key);
			const activeTrip = (await (await cache.match('/__active_trip__'))?.text())?.trim();
			if (
				activeTrip &&
				(
					await Promise.all(
						['/shots', '/shopping-list', '/menu'].map((path) =>
							cache.match(`${path}?__trip_cache=${activeTrip}`)
						)
					)
				).every(Boolean)
			) {
				return true;
			}
		}
		return false;
	});

	await page.goto('/shots?mode=record');
	await expect(page.getByRole('heading', { name: 'Dagens scener' })).toBeVisible();
	await context.setOffline(true);
	await page.reload();

	await expect(page.getByRole('heading', { name: 'Dagens scener' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Kart' })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText(
		/Frakoblet|Synkronisert|Kunne ikke synkronisere/
	);
	const firstScene = page.locator('main details').first();
	await firstScene.locator('summary').click();
	const firstShot = firstScene.getByRole('button').first();
	await expect(firstShot).toBeEnabled();
	await firstShot.click();
	await expect(firstShot).toHaveAttribute('aria-pressed', 'true');
});
