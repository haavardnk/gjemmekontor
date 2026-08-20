import { expect, test } from '@playwright/test';

test('requires the configured shared password', async ({ page }) => {
	const loginResponse = await page.request.get('/login');
	const loginHtml = await loginResponse.text();
	expect(loginHtml).toMatch(/<form\b[^>]*\bmethod="post"/);

	await page.goto('/');
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { name: 'Velkommen om bord' })).toBeVisible();

	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('wrong-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page.getByText('Passordet er ikke riktig.')).toBeVisible();

	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
	await expect(page.getByRole('link', { name: 'Kart' })).toHaveAttribute('aria-current', 'page');

	await page.getByRole('button', { name: 'Logg ut' }).click();
	await expect(page).toHaveURL(/\/login$/);
});

test('accepts the native login form without putting the password in the URL', async ({
	request
}) => {
	const response = await request.post('/login', {
		form: { password: 'test-password' },
		headers: {
			accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			origin: 'http://localhost:4173'
		},
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe('/map');
	expect(response.url()).toBe('http://localhost:4173/login');
	expect(response.url()).not.toContain('password');
});
