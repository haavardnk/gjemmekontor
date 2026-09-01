import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
	await page.goto('/t/kroatia-2026/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

async function openMenu(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Mer' }).click();
	await page
		.getByRole('dialog', { name: 'Flere moduler' })
		.getByRole('link', { name: 'Meny' })
		.click();
}

function dishEditor(page: Page) {
	return page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'Navn' }) });
}

async function swipe(
	page: Page,
	startX: number,
	startY: number,
	endX: number,
	endY: number
): Promise<void> {
	const session = await page.context().newCDPSession(page);
	await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
	await session.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: startX, y: startY }]
	});
	for (let step = 1; step <= 4; step += 1) {
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{
					x: startX + ((endX - startX) * step) / 4,
					y: startY + ((endY - startY) * step) / 4
				}
			]
		});
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

test.use({ viewport: { width: 390, height: 844 } });

test('shows an edited dish title in the active menu immediately', async ({ page }) => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const originalName = `Fiskegryte ${suffix}`;
	const updatedName = `Kremet fiskegryte ${suffix}`;

	await login(page);
	await openMenu(page);
	await page.getByRole('button', { name: 'Ny rett' }).click();
	let form = dishEditor(page);
	await form.getByRole('textbox', { name: 'Navn' }).fill(originalName);
	await form.getByRole('button', { name: 'Lagre' }).click();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();

	const originalCard = page.locator('article:visible', { hasText: originalName }).first();
	await originalCard.getByRole('button', { name: `Rediger ${originalName}` }).click();
	form = dishEditor(page);
	await form.getByRole('textbox', { name: 'Navn' }).fill(updatedName);
	await form.getByRole('button', { name: 'Lagre' }).click();

	await expect(page.locator('article:visible', { hasText: updatedName }).first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Ny versjon' })).toHaveCount(0);
});

test('creates and reads an offline recipe with compact responsive controls', async ({
	context,
	page
}) => {
	const dishName = `Kremet tagliatelle med scampi og grønnsaker ${crypto.randomUUID().slice(0, 8)}`;
	await login(page);
	await openMenu(page);

	await expect(page).toHaveURL(/\/menu$/);
	await expect(page.getByRole('heading', { name: 'Meny', exact: true })).toBeVisible();
	const mobileNavigation = page.getByRole('navigation', { name: 'Hovednavigasjon' });
	await expect(mobileNavigation.locator(':scope > a:visible')).toHaveCount(4);
	await expect(mobileNavigation.getByRole('button', { name: 'Mer' })).toBeVisible();
	const menuTab = page.getByRole('tab', { name: 'Meny', exact: true });
	const archiveTab = page.getByRole('tab', { name: 'Arkiv', exact: true });
	expect(
		await menuTab.evaluate((element) => element.getBoundingClientRect().height)
	).toBeLessThanOrEqual(33);
	expect(
		await archiveTab.evaluate((element) => element.getBoundingClientRect().height)
	).toBeLessThanOrEqual(33);

	await page.getByRole('button', { name: 'Ny rett' }).click();
	const form = dishEditor(page);
	const editorBounds = await form.locator('form').evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const footer = element.querySelector('footer')?.getBoundingClientRect();
		return {
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			footerBottom: footer?.bottom ?? 0
		};
	});
	expect(editorBounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844, footerBottom: 844 });
	await expect(form.locator('input[type="number"]')).toHaveCount(2);
	await expect(form.getByText('Oppskriften er for', { exact: true })).toBeVisible();
	await expect(form.getByText('Porsjoner i menyen', { exact: true })).toBeVisible();
	await form.getByRole('textbox', { name: 'Navn' }).fill(dishName);
	await form.getByRole('button', { name: 'Ingrediens', exact: true }).click();
	await form.getByPlaceholder('Mengde').fill('2');
	const unit = form.getByPlaceholder('Enhet');
	await expect(unit).toHaveAttribute('list', 'menu-unit-options');
	await expect(form.locator('#menu-unit-options option')).toHaveCount(15);
	await unit.fill('stk');
	await form.getByPlaceholder('Ingrediens', { exact: true }).fill('Tomater');
	await form.getByRole('button', { name: 'Ingrediens', exact: true }).click();
	await form.getByPlaceholder('Mengde').nth(1).fill('110');
	await form.getByPlaceholder('Enhet').nth(1).fill('g');
	await form.getByPlaceholder('Ingrediens', { exact: true }).nth(1).fill('Hvetemel');
	const ingredientRowHeights = await form
		.getByTestId('ingredient-row')
		.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
	expect(Math.max(...ingredientRowHeights)).toBeLessThanOrEqual(220);
	await form.getByRole('spinbutton', { name: 'Porsjoner i menyen' }).fill('8');
	await expect(form.getByPlaceholder('Mengde').first()).toHaveValue('4');
	await expect(form.getByPlaceholder('Mengde').nth(1)).toHaveValue('220');
	await form.getByRole('button', { name: 'Steg', exact: true }).click();
	await form.getByPlaceholder('Beskriv steget').fill('Kok alt rolig i ti minutter.');
	await form.getByRole('button', { name: 'Steg', exact: true }).click();
	await form.getByPlaceholder('Beskriv steget').nth(1).fill('Server gryten mens den er varm.');
	const instructionRowHeights = await form
		.getByTestId('instruction-row')
		.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
	expect(Math.max(...instructionRowHeights)).toBeLessThanOrEqual(250);
	await form.getByRole('button', { name: 'Lagre' }).click();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();

	const card = page.locator('article', { hasText: dishName }).first();
	await expect(card).toBeVisible();
	const secondDishName = `Reorder-gryte ${crypto.randomUUID().slice(0, 8)}`;
	await page.getByRole('button', { name: 'Ny rett' }).click();
	const secondForm = dishEditor(page);
	await secondForm.getByRole('textbox', { name: 'Navn' }).fill(secondDishName);
	await secondForm.getByRole('button', { name: 'Lagre' }).click();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();
	const orderedCard = page.locator('article:visible', { hasText: dishName }).first();
	const visibleCards = page.locator('article:visible');
	const cardIndex = async (): Promise<number> =>
		(await visibleCards.allTextContents()).findIndex((text) => text.includes(dishName));
	const beforeOrder = await cardIndex();
	const moveUp = orderedCard.getByRole('button', { name: `Flytt ${dishName} opp i middag` });
	const orderDelta = (await moveUp.isEnabled()) ? -1 : 1;
	await orderedCard
		.getByRole('button', {
			name: orderDelta === -1 ? `Flytt ${dishName} opp i middag` : `Flytt ${dishName} ned i middag`
		})
		.click();
	await expect.poll(cardIndex).toBe(beforeOrder + orderDelta);
	await card.getByRole('button', { name: `Rediger ${dishName}` }).click();
	const editForm = dishEditor(page);
	await editForm.getByLabel('Lunsj').check();
	await editForm.getByRole('spinbutton', { name: 'Porsjoner i menyen' }).fill('6');
	await expect(editForm.getByPlaceholder('Mengde').first()).toHaveValue('3');
	await expect(editForm.getByPlaceholder('Mengde').nth(1)).toHaveValue('165');
	await editForm.getByRole('button', { name: 'Lagre' }).click();
	const visibleCard = page.locator('article:visible', { hasText: dishName }).first();
	await expect(visibleCard.getByText('6 porsjoner · 2 ingredienser')).toBeVisible();
	await expect(visibleCard.getByText('Lunsj', { exact: true })).toBeVisible();

	await visibleCard.getByRole('button', { name: 'Oppskrift' }).click();
	const recipe = page.getByRole('dialog');
	await expect(recipe.getByText('Kok alt rolig i ti minutter.')).toBeVisible();
	await expect(recipe.getByText('3 stk', { exact: false })).toBeVisible();
	const backgroundScrollY = await page.evaluate(() => window.scrollY);
	await recipe.getByRole('button', { name: 'Start matlaging' }).click();
	const cookingMode = page.getByTestId('cooking-mode');
	await expect(cookingMode).toBeVisible();
	await expect(cookingMode).toHaveCSS('touch-action', 'none');
	await expect(cookingMode.getByTestId('cooking-step')).toHaveCSS('touch-action', 'none');
	await expect(cookingMode.getByText('Sveip for ingredienser')).toHaveCount(0);
	await expect(cookingMode.getByText('Sveip opp eller ned mellom stegene')).toHaveCount(0);
	await page.setViewportSize({ width: 320, height: 568 });
	const narrowCookingBounds = await cookingMode.boundingBox();
	const narrowTitleBounds = await cookingMode
		.getByRole('heading', { name: dishName })
		.boundingBox();
	const narrowControlBounds = await Promise.all([
		cookingMode.getByRole('button', { name: 'Avslutt matlaging' }).boundingBox(),
		cookingMode.getByRole('button', { name: 'Ingredienser' }).boundingBox(),
		cookingMode.getByRole('button', { name: 'Forrige steg' }).boundingBox(),
		cookingMode.getByRole('button', { name: 'Neste steg' }).boundingBox()
	]);
	if (!narrowCookingBounds || !narrowTitleBounds) {
		throw new Error('Narrow cooking mode bounds are unavailable');
	}
	expect(narrowTitleBounds.x + narrowTitleBounds.width).toBeLessThanOrEqual(
		narrowCookingBounds.x + narrowCookingBounds.width
	);
	expect(
		narrowControlBounds.every(
			(bounds) =>
				bounds !== null &&
				bounds.x >= narrowCookingBounds.x &&
				bounds.x + bounds.width <= narrowCookingBounds.x + narrowCookingBounds.width
		)
	).toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });
	const cookingBounds = await cookingMode.boundingBox();
	expect(cookingBounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
	await expect(recipe.getByText('Steg 1 av 2')).toBeVisible();
	await expect(recipe.getByText('Kok alt rolig i ti minutter.')).toBeVisible();
	if (!cookingBounds) throw new Error('Cooking mode bounds are unavailable');
	await swipe(
		page,
		cookingBounds.x + cookingBounds.width / 2,
		cookingBounds.y + 250,
		cookingBounds.x + cookingBounds.width / 2,
		cookingBounds.y + 100
	);
	await expect(recipe.getByText('Steg 2 av 2')).toBeVisible();
	await expect(recipe.getByText('Server gryten mens den er varm.')).toBeVisible();
	await swipe(
		page,
		cookingBounds.x + 300,
		cookingBounds.y + 90,
		cookingBounds.x + 180,
		cookingBounds.y + 90
	);
	await expect(recipe.getByRole('heading', { name: 'Ingredienser' })).toBeVisible();
	await expect(cookingMode).toHaveCSS('touch-action', 'pan-y');
	await expect(recipe.getByText('Tomater')).toBeVisible();
	await expect(recipe.getByText('3 stk', { exact: false })).toBeVisible();
	await recipe.getByRole('button', { name: 'Volum', exact: true }).click();
	await expect(recipe.getByText('≈ 3 dl', { exact: false })).toBeVisible();
	const ingredientPanel = cookingMode.getByTestId('cooking-ingredients');
	await expect
		.poll(async () => (await ingredientPanel.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
		.toBeLessThan(390);
	const mobileIngredientBounds = await ingredientPanel.boundingBox();
	if (!mobileIngredientBounds) throw new Error('Ingredient panel bounds are unavailable');
	expect(mobileIngredientBounds.x).toBeLessThan(390);
	expect(mobileIngredientBounds.x + mobileIngredientBounds.width).toBeGreaterThan(0);
	await recipe.getByRole('button', { name: 'Tilbake til gjeldende steg' }).click();
	await expect(recipe.getByRole('heading', { name: 'Ingredienser' })).toBeHidden();
	await expect(recipe.getByText('Server gryten mens den er varm.')).toBeVisible();
	await page.setViewportSize({ width: 1_440, height: 900 });
	await recipe.getByRole('button', { name: 'Ingredienser' }).click();
	await expect(recipe.getByRole('heading', { name: 'Ingredienser' })).toBeVisible();
	await expect(recipe.getByText('Tomater')).toBeVisible();
	await expect
		.poll(async () => (await ingredientPanel.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
		.toBeLessThan(1_440);
	const desktopIngredientBounds = await ingredientPanel.boundingBox();
	if (!desktopIngredientBounds) throw new Error('Desktop ingredient panel bounds are unavailable');
	expect(desktopIngredientBounds.x).toBeLessThan(1_440);
	expect(desktopIngredientBounds.x + desktopIngredientBounds.width).toBeGreaterThan(0);
	await recipe.getByRole('button', { name: 'Tilbake til gjeldende steg' }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	await recipe.getByRole('button', { name: 'Avslutt matlaging' }).click();
	await expect(cookingMode).toBeHidden();
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(backgroundScrollY);
	await page.getByRole('dialog').getByRole('button', { name: 'Lukk oppskriften' }).first().click();

	await archiveTab.click();
	const archiveSearch = page.getByRole('textbox', { name: 'Søk i arkivet' });
	const widths = await archiveSearch.evaluate((element) => {
		const label = element.closest('label')?.getBoundingClientRect();
		const sectionElement = element.closest('section');
		const section = sectionElement?.getBoundingClientRect();
		const style = sectionElement ? getComputedStyle(sectionElement) : undefined;
		const contentWidth =
			(section?.width ?? 0) -
			Number.parseFloat(style?.paddingLeft ?? '0') -
			Number.parseFloat(style?.paddingRight ?? '0');
		return { label: label?.width ?? 0, content: contentWidth };
	});
	expect(Math.abs(widths.content - widths.label)).toBeLessThanOrEqual(1);
	await archiveSearch.fill(dishName);
	await expect(page.getByText(dishName, { exact: true })).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
	await page.waitForFunction(async (): Promise<boolean> => {
		if (!navigator.serviceWorker.controller) return false;
		const key = (await caches.keys()).find((candidate) =>
			candidate.startsWith('gjemmekontor-pages-')
		);
		return key ? Boolean(await (await caches.open(key)).match('/menu')) : false;
	});
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Meny', exact: true })).toBeVisible();

	await context.setOffline(true);
	await page.reload();
	await page.getByRole('tab', { name: 'Arkiv', exact: true }).click();
	await page.getByRole('textbox', { name: 'Søk i arkivet' }).fill(dishName);
	const offlineRow = page.locator('article', { hasText: dishName });
	await expect(offlineRow).toBeVisible();
	await offlineRow.getByRole('button', { name: `Vis oppskrift for ${dishName}` }).click();
	await expect(page.getByRole('dialog').getByText('Kok alt rolig i ti minutter.')).toBeVisible();
});

test('creates a menu dish offline, survives reload, and publishes it on reconnect', async ({
	context,
	page
}) => {
	const dishName = `Offlinegryte ${crypto.randomUUID().slice(0, 8)}`;
	await login(page);
	await openMenu(page);
	await expect(page.getByRole('status')).toHaveText('Synkronisert');
	await expect(page.getByLabel('Tilgjengelig uten nett')).toBeVisible();
	await context.setOffline(true);

	await page.getByRole('button', { name: 'Ny rett' }).click();
	const form = dishEditor(page);
	await form.getByRole('textbox', { name: 'Navn' }).fill(dishName);
	await form.getByRole('button', { name: 'Lagre' }).click();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();
	await expect(page.getByText(dishName, { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('status')).toContainText(/Uten nett · 2 venter/);

	await page.reload();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();
	await expect(page.getByText(dishName, { exact: true }).first()).toBeVisible();
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByRole('status')).toHaveText('Synkronisert', { timeout: 15_000 });
	await page.reload();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();
	await expect(page.getByText(dishName, { exact: true }).first()).toBeVisible();
});

test('can replace one or all shopping descriptions from the phone preview', async ({ page }) => {
	const dishName = `Kremet tagliatelle med scampi og grønnsaker ${crypto.randomUUID().slice(0, 8)}`;
	await page.route('**/api/menu/shopping/preview', async (route) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				fingerprint: 'a'.repeat(64),
				skippedDishes: [],
				rows: [
					{
						id: '0123456789abcdef',
						sourceRowIds: ['0123456789abcdef'],
						include: true,
						name: 'Bacon',
						sourceName: 'Bacon',
						alreadyInList: true,
						currentSpecification: 'Oppbevares kjølig',
						proposedSpecification:
							'Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke | Fra før: Oppbevares kjølig',
						preservedSpecification:
							'Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke | Fra før: Oppbevares kjølig',
						replacementSpecification: 'Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke',
						warnings: [],
						requiresCorrection: false,
						archiveIds: [],
						dishNames: ['Pasta', 'Pizza']
					},
					{
						id: 'fedcba9876543210',
						sourceRowIds: ['fedcba9876543210'],
						include: true,
						name: 'Tomater',
						sourceName: 'Tomater',
						alreadyInList: true,
						currentSpecification: 'Økologiske',
						proposedSpecification: 'Totalt: 4 stk | Pasta: 4 stk | Fra før: Økologiske',
						preservedSpecification: 'Totalt: 4 stk | Pasta: 4 stk | Fra før: Økologiske',
						replacementSpecification: 'Totalt: 4 stk | Pasta: 4 stk',
						warnings: [],
						requiresCorrection: false,
						archiveIds: [],
						dishNames: ['Pasta']
					}
				]
			})
		});
	});
	await page.route('**/api/menu/shopping/apply', async (route) => {
		const body = route.request().postDataJSON() as {
			cycles: Array<{ archiveId: string; cycleId: string }>;
		};
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				snapshot: null,
				batchId: '123e4567-e89b-42d3-a456-426614174000',
				appliedAt: '2026-08-25T12:00:00.000Z',
				appliedCycles: body.cycles
			})
		});
	});
	await login(page);
	await openMenu(page);
	await page.getByRole('button', { name: 'Ny rett' }).click();
	const form = dishEditor(page);
	await form.getByRole('textbox', { name: 'Navn' }).fill(dishName);
	await form.getByRole('button', { name: 'Ingrediens', exact: true }).click();
	await form.getByPlaceholder('Ingrediens', { exact: true }).fill('Bacon');
	await form.getByRole('button', { name: 'Lagre' }).click();
	await page.getByRole('button', { name: 'Hele menyen til handlelisten' }).click();

	const preview = page.getByRole('dialog');
	const descriptions = preview.getByRole('textbox', { name: 'Beskrivelse', exact: true });
	const description = descriptions.first();
	await expect(description).toHaveValue(
		'Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke | Fra før: Oppbevares kjølig'
	);
	const replaceDescription = preview
		.getByRole('checkbox', { name: 'Lag beskrivelsen på nytt' })
		.first();
	await replaceDescription.check();
	await expect(description).toHaveValue('Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke');
	await replaceDescription.uncheck();
	await preview.getByRole('button', { name: 'Lag alle beskrivelser på nytt' }).click();
	await expect(description).toHaveValue('Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke');
	await expect(descriptions.nth(1)).toHaveValue('Totalt: 4 stk | Pasta: 4 stk');
	const previewWidth = await preview.evaluate((element) => element.scrollWidth);
	expect(previewWidth).toBeLessThanOrEqual(390);
	await preview.getByRole('button', { name: 'Legg til valgte' }).click();
	await expect(preview).toBeHidden();
	await page.getByRole('tab', { name: 'Middag', exact: true }).click();
	await expect(page.getByRole('heading', { name: dishName })).toBeVisible();
});
