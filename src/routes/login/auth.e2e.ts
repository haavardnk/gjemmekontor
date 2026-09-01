import { expect, test } from '@playwright/test';

test('selects a trip and requires its shared password', async ({ page }) => {
	const loginResponse = await page.request.get('/t/testreise/unlock');
	const loginHtml = await loginResponse.text();
	expect(loginHtml).toMatch(/<form\b[^>]*\bmethod="post"/);

	await page.goto('/');
	await expect(page).toHaveURL(/\/trips$/);
	await expect(page.getByRole('img', { name: 'Gjemmekontor' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Velg reise' })).toBeVisible();
	await page.getByRole('link', { name: /Testreise/ }).click();
	await expect(page).toHaveURL(/\/t\/testreise\/unlock$/);
	await expect(page.getByRole('heading', { name: 'Velkommen til testreisen' })).toBeVisible();

	await page.locator('#password').fill('wrong-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page.getByText('Reisepassordet er ikke riktig.')).toBeVisible();

	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
	await expect(page.getByRole('link', { name: 'Gjemmekontor' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Kart' })).toHaveAttribute('aria-current', 'page');

	await page.getByRole('button', { name: 'Logg ut' }).click();
	await expect(page).toHaveURL(/\/trips$/);
});

test('accepts the native login form without putting the password in the URL', async ({
	request
}) => {
	const response = await request.post('/t/testreise/unlock', {
		form: { password: 'test-password' },
		headers: {
			accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			origin: 'http://127.0.0.1:4173'
		},
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe('/map');
	expect(response.url()).toBe('http://127.0.0.1:4173/t/testreise/unlock');
	expect(response.url()).not.toContain('password');
});

test('publishes Monsieur Bintang install icons and transparent favicon', async ({ page }) => {
	const manifestResponse = await page.request.get('/manifest.webmanifest');
	expect(manifestResponse.ok()).toBe(true);
	const manifest = (await manifestResponse.json()) as {
		icons: { src: string; sizes: string; purpose: string }[];
	};
	expect(manifest.icons).toEqual([
		{
			src: '/monsieur-bintang-pwa-192.png',
			sizes: '192x192',
			type: 'image/png',
			purpose: 'any maskable'
		},
		{
			src: '/monsieur-bintang-pwa-512.png',
			sizes: '512x512',
			type: 'image/png',
			purpose: 'any maskable'
		}
	]);

	await page.goto('/trips');
	await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/favicon\.png$/);
	const pixels = await page.evaluate(async () => {
		async function samples(path: string): Promise<number[][]> {
			const image = new Image();
			image.src = path;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
			context.drawImage(image, 0, 0);
			return [
				Array.from(context.getImageData(0, 0, 1, 1).data),
				Array.from(
					context.getImageData(
						Math.floor(image.naturalWidth / 2),
						Math.floor(image.naturalHeight / 2),
						1,
						1
					).data
				)
			];
		}
		return {
			pwa192: await samples('/monsieur-bintang-pwa-192.png'),
			pwa512: await samples('/monsieur-bintang-pwa-512.png'),
			appleTouch: await samples('/monsieur-bintang-apple-touch-icon.png'),
			favicon: await samples('/favicon.png')
		};
	});
	expect(pixels.pwa192[0]).toEqual(pixels.pwa512[0]);
	expect(pixels.appleTouch[0]).toEqual(pixels.pwa192[0]);
	expect(pixels.pwa192[0]?.[3]).toBe(255);
	expect(pixels.pwa192[1]).not.toEqual(pixels.pwa192[0]);
	expect(pixels.pwa512[1]).not.toEqual(pixels.pwa512[0]);
	expect(pixels.appleTouch[1]).not.toEqual(pixels.appleTouch[0]);
	expect(pixels.favicon[0]?.[3]).toBe(0);
	expect(pixels.favicon[1]?.[3]).toBe(255);
});
