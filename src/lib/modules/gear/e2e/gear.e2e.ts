import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

test('plans, filters, reorders, purchases, and packs shared gear', async ({ page }) => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const firstCategoryName = `Sikkerhet ${suffix}`;
	const secondCategoryName = `Elektronikk ${suffix}`;
	const ownerName = `Håvard ${suffix}`;
	const purchaseItemName = `Redningsvest ${suffix}`;
	const availableItemName = `Kartplotter ${suffix}`;

	await login(page);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Utstyr' }).click();

	await expect(page).toHaveURL(/\/gear$/);
	await expect(page.getByRole('heading', { name: 'Utstyr', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mer' })).toHaveAttribute('aria-current', 'page');

	for (const categoryName of [firstCategoryName, secondCategoryName]) {
		await page.getByRole('button', { name: 'Kategori', exact: true }).click();
		const categoryDialog = page.getByRole('dialog');
		await categoryDialog.getByRole('textbox', { name: 'Kategorinavn' }).fill(categoryName);
		await categoryDialog.getByRole('button', { name: 'Lagre' }).click();
		await expect(categoryDialog).not.toBeVisible();
	}

	await page.getByRole('button', { name: 'Personer' }).click();
	const ownersDialog = page.getByRole('dialog');
	await ownersDialog.getByRole('textbox', { name: 'Navn på person' }).fill(ownerName);
	await ownersDialog.getByRole('button', { name: 'Legg til' }).click();
	await expect(ownersDialog.getByRole('textbox', { name: `Navn på ${ownerName}` })).toBeVisible();
	await ownersDialog.getByRole('button', { name: 'Ferdig' }).click();

	const firstCategory = page.getByRole('group', { name: firstCategoryName });
	await firstCategory.getByRole('button', { name: 'Legg til utstyr' }).click();
	let itemDialog = page.getByRole('dialog');
	await itemDialog.getByRole('textbox', { name: 'Utstyrsnavn' }).fill(purchaseItemName);
	await itemDialog.getByRole('spinbutton', { name: 'Antall' }).fill('2');
	await itemDialog.getByRole('combobox', { name: 'Person' }).selectOption({ label: ownerName });
	await itemDialog.getByRole('combobox', { name: 'Tilgjengelighet' }).selectOption('need-to-buy');
	await itemDialog.getByRole('textbox', { name: 'Notater' }).fill('Automatisk vest');
	await itemDialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(itemDialog).not.toBeVisible();
	await expect(firstCategory).toContainText('1 ting · 1 må kjøpes');

	const secondCategory = page.getByRole('group', { name: secondCategoryName });
	await secondCategory.getByRole('button', { name: 'Legg til utstyr' }).click();
	itemDialog = page.getByRole('dialog');
	await itemDialog.getByRole('textbox', { name: 'Utstyrsnavn' }).fill(availableItemName);
	await itemDialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(itemDialog).not.toBeVisible();

	await page.getByRole('button', { name: 'Arkiv', exact: true }).click();
	let archivedPurchaseItem = page.getByRole('article', { name: purchaseItemName });
	await expect(archivedPurchaseItem).toContainText(firstCategoryName);
	await expect(archivedPurchaseItem).toContainText(ownerName);
	await expect(archivedPurchaseItem).toContainText('Må kjøpes');
	await expect(page.getByRole('article', { name: availableItemName })).toBeVisible();

	await archivedPurchaseItem
		.getByRole('button', { name: `Fjern ${purchaseItemName} fra listen` })
		.click();
	await page.getByRole('button', { name: 'Planlegg', exact: true }).click();
	await expect(page.getByText(purchaseItemName, { exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Arkiv', exact: true }).click();
	archivedPurchaseItem = page.getByRole('article', { name: purchaseItemName });
	await archivedPurchaseItem
		.getByRole('button', { name: `Legg ${purchaseItemName} til listen` })
		.click();

	const archiveSearch = page.getByRole('searchbox', { name: 'Søk i arkivet' });
	await archiveSearch.fill('Automatisk vest');
	await expect(archivedPurchaseItem).toBeVisible();
	await expect(page.getByRole('article', { name: availableItemName })).toHaveCount(0);
	await archiveSearch.fill('');

	await page.getByRole('button', { name: 'Filter og sortering', exact: true }).click();
	let filtersDialog = page.getByRole('dialog');
	await filtersDialog
		.getByRole('combobox', { name: 'Filtrer arkivet på kategori' })
		.selectOption({ label: firstCategoryName });
	await filtersDialog
		.getByRole('combobox', { name: 'Filtrer arkivet på person' })
		.selectOption({ label: ownerName });
	await filtersDialog
		.getByRole('combobox', { name: 'Filtrer arkivet på tilgjengelighet' })
		.selectOption('need-to-buy');
	await filtersDialog
		.getByRole('combobox', { name: 'Filtrer arkivet på listestatus' })
		.selectOption('planned');
	await filtersDialog.getByRole('combobox', { name: 'Sorter arkivet' }).selectOption('category');
	await filtersDialog.getByRole('button', { name: 'Ferdig' }).click();
	await expect(archivedPurchaseItem).toBeVisible();
	await expect(page.getByRole('article', { name: availableItemName })).toHaveCount(0);
	await page.getByRole('button', { name: 'Filter og sortering', exact: true }).click();
	filtersDialog = page.getByRole('dialog');
	await filtersDialog.getByRole('button', { name: 'Nullstill' }).click();
	await filtersDialog.getByRole('button', { name: 'Ferdig' }).click();
	await page.getByRole('button', { name: 'Planlegg', exact: true }).click();

	await page.getByRole('button', { name: 'Filter og sortering', exact: true }).click();
	filtersDialog = page.getByRole('dialog');
	await filtersDialog
		.getByRole('combobox', { name: 'Filtrer på person' })
		.selectOption({ label: ownerName });
	await filtersDialog.getByRole('button', { name: 'Ferdig' }).click();
	await expect(firstCategory).toBeVisible();
	await expect(page.getByRole('group', { name: secondCategoryName })).toHaveCount(0);
	await page.getByRole('button', { name: 'Filter og sortering', exact: true }).click();
	filtersDialog = page.getByRole('dialog');
	await filtersDialog.getByRole('button', { name: 'Nullstill' }).click();
	await filtersDialog.getByRole('button', { name: 'Ferdig' }).click();

	await page.setViewportSize({ width: 768, height: 900 });
	await firstCategory
		.getByRole('button', { name: `Dra kategorien ${firstCategoryName}` })
		.dragTo(secondCategory);
	await expect(page.getByRole('group', { name: firstCategoryName })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });

	await page.getByRole('button', { name: 'Pakk', exact: true }).click();
	await firstCategory.getByRole('button', { name: 'Kjøpt inn' }).click();
	await expect(firstCategory).toContainText('0/1 pakket');
	const packedCheckbox = firstCategory.getByRole('checkbox', {
		name: `Pakket ${purchaseItemName}`
	});
	await packedCheckbox.check();
	await expect(firstCategory).toContainText('1/1 pakket');

	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Nullstill pakkelisten' }).click();
	await expect(packedCheckbox).not.toBeChecked();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
