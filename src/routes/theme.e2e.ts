import { expect, test } from '@playwright/test';

test('follows the system theme and persists a manual override', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/login');
	const root = page.locator('html');
	await expect(root).toHaveAttribute('data-theme', 'gjemmekontor');
	await expect(page.getByRole('button', { name: 'Bruk mørkt tema' })).toBeVisible();

	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(root).toHaveAttribute('data-theme', 'gjemmekontor-dark');
	await expect(root).toHaveCSS('color-scheme', 'dark');

	await page.getByRole('button', { name: 'Bruk lyst tema' }).click();
	await expect(root).toHaveAttribute('data-theme', 'gjemmekontor');
	await expect(root).toHaveCSS('color-scheme', 'light');
	await page.reload();
	await expect(root).toHaveAttribute('data-theme', 'gjemmekontor');
	await expect(page.getByRole('button', { name: 'Bruk mørkt tema' })).toBeVisible();
});
