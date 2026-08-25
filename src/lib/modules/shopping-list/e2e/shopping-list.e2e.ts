import { expect, type Page, test } from '@playwright/test';

type Item = { sourceName: string; name: string; specification: string };

async function login(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

test('adds, completes, and restores Bring items with responsive module navigation', async ({
	page
}) => {
	let items: Item[] = [{ sourceName: 'Olivenöl', name: 'Olivenolje', specification: '1 flaske' }];
	let recentItems: Item[] = [{ sourceName: 'Eier', name: 'Egg', specification: '' }];
	let failRefresh = false;
	const requests: Array<{ method: string; body: unknown }> = [];
	await page.route('**/api/shopping-list{,/items}', async (route) => {
		const request = route.request();
		const pathname = new URL(request.url()).pathname;
		if (request.method() === 'GET') {
			if (failRefresh) {
				await route.fulfill({ status: 502, json: { error: 'BRING_UNAVAILABLE' } });
				return;
			}
		} else {
			const body = request.postDataJSON() as {
				name?: string;
				sourceName?: string;
				specification?: string;
			};
			requests.push({ method: request.method(), body });
			if (request.method() === 'POST') {
				const restored = recentItems.find(
					(item) => item.name === body.name || item.sourceName === body.name
				);
				const added = restored ?? {
					sourceName: body.name ?? '',
					name: body.name ?? '',
					specification: body.specification ?? ''
				};
				items = [added, ...items.filter((item) => item.sourceName !== added.sourceName)];
				recentItems = recentItems.filter((item) => item.sourceName !== added.sourceName);
			} else if (request.method() === 'PUT') {
				items = items.map((item) =>
					item.sourceName === body.sourceName
						? { ...item, specification: body.specification ?? '' }
						: item
				);
			} else {
				const completed = items.find((item) => item.sourceName === body.sourceName);
				items = items.filter((item) => item.sourceName !== body.sourceName);
				if (completed) {
					recentItems = [...recentItems, completed];
				}
			}
		}
		await route.fulfill({
			json: {
				listUuid: 'trip-list',
				listName: 'Kroatia 2026',
				items,
				recentItems,
				fetchedAt: '2026-08-21T10:00:00.000Z'
			}
		});
		if (pathname !== '/api/shopping-list' && pathname !== '/api/shopping-list/items') {
			throw new Error('Unexpected shopping-list route');
		}
	});
	await login(page);
	await page.getByRole('link', { name: 'Handleliste' }).click();

	await expect(page).toHaveURL(/\/shopping-list$/);
	await expect(page.getByRole('heading', { name: 'Handleliste' })).toBeVisible();
	await expect(page.getByText('Kroatia 2026 · 1 vare')).toBeVisible();
	await expect(page.getByText('Olivenolje')).toBeVisible();
	await expect(page.getByText('1 flaske')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Handleliste' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.locator('nav > a')).toHaveCount(5);

	const itemInput = page.getByRole('textbox', { name: 'Vare' });
	const specificationInput = page.getByRole('textbox', { name: 'Detaljer' });
	await itemInput.fill('Melk&=+');
	await specificationInput.fill('2+ liter&=');
	await expect(itemInput).toHaveValue('Melk');
	await expect(specificationInput).toHaveValue('2 liter');
	const mobileControlWidths = await Promise.all([
		itemInput.evaluate((element) => element.closest('label')?.getBoundingClientRect().width ?? 0),
		specificationInput.evaluate(
			(element) => element.closest('label')?.getBoundingClientRect().width ?? 0
		),
		page
			.getByRole('button', { name: 'Legg til', exact: true })
			.evaluate((element) => element.getBoundingClientRect().width)
	]);
	expect(Math.max(...mobileControlWidths) - Math.min(...mobileControlWidths)).toBeLessThanOrEqual(
		1
	);
	await page.getByRole('button', { name: 'Legg til', exact: true }).click();
	await expect(page.getByText('Melk', { exact: true })).toBeVisible();
	await expect(page.getByText('2 liter')).toBeVisible();
	await expect(itemInput).toBeFocused();
	const search = page.getByRole('searchbox', { name: 'Søk i handlelisten' });
	await search.fill('OLIVEN');
	await expect(page.getByRole('list', { name: 'Varer' }).getByText('Olivenolje')).toBeVisible();
	await expect(
		page.getByRole('list', { name: 'Varer' }).getByText('Melk', { exact: true })
	).toHaveCount(0);
	await search.fill('brød');
	await expect(page.getByText('Ingen varer matcher søket.')).toBeVisible();
	await page.getByRole('button', { name: 'Tøm søket' }).click();
	await expect(search).toHaveValue('');
	const editMelk = page.getByRole('button', { name: 'Endre Melk' });
	await expect(editMelk).toHaveCSS('cursor', 'pointer');
	await editMelk.click();
	const editDialog = page.getByRole('dialog');
	await expect(editDialog.getByRole('heading', { name: 'Endre vare' })).toBeVisible();
	const editSpecificationInput = editDialog.getByRole('textbox', { name: 'Detaljer for vare' });
	await editSpecificationInput.fill('3+ liter&=');
	await expect(editSpecificationInput).toHaveValue('3 liter');
	await editDialog.getByRole('button', { name: 'Lagre' }).click();
	await expect(editDialog).not.toBeVisible();
	await expect(page.getByText('3 liter')).toBeVisible();

	const activeMelk = page.getByRole('button', { name: 'Marker Melk som kjøpt' });
	await expect(activeMelk).toHaveCSS('cursor', 'pointer');
	await activeMelk.getByText('Melk', { exact: true }).click();
	const recentList = page.getByRole('list', { name: 'Nylig kjøpt' });
	await expect(
		page.getByRole('list', { name: 'Varer' }).getByText('Melk', { exact: true })
	).toHaveCount(0);
	await expect(recentList.getByRole('listitem').first()).toContainText('Melk');
	await expect(recentList.getByRole('listitem').nth(1)).toContainText('Egg');
	const recentMelk = recentList.getByRole('button', { name: 'Legg Melk tilbake på listen' });
	await expect(recentMelk).toHaveCSS('cursor', 'pointer');
	await recentMelk.getByText('Melk', { exact: true }).click();
	const activeList = page.getByRole('list', { name: 'Varer' });
	await expect(activeList.getByText('Melk', { exact: true })).toBeVisible();
	await expect(activeList.getByRole('listitem').first()).toContainText('Melk');
	await expect(requests).toEqual([
		{ method: 'POST', body: { name: 'Melk', specification: '2 liter' } },
		{ method: 'PUT', body: { sourceName: 'Melk', specification: '3 liter' } },
		{ method: 'PATCH', body: { sourceName: 'Melk' } },
		{ method: 'POST', body: { name: 'Melk', specification: '3 liter' } }
	]);

	failRefresh = true;
	await page.getByRole('button', { name: 'Oppdater handlelisten' }).click();
	await expect(page.getByRole('alert')).toContainText('Bring er ikke tilgjengelig akkurat nå.');
	await expect(page.getByText('Olivenolje')).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
	await page.setViewportSize({ width: 1280, height: 800 });
	const desktopDimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(desktopDimensions.width).toBeLessThanOrEqual(desktopDimensions.viewport);
	await expect(page.getByRole('link', { name: 'Handleliste' })).toBeVisible();
});

test('syncs remote changes on focus and while open without overwriting local writes', async ({
	page
}) => {
	let items: Item[] = [{ sourceName: 'Olivenöl', name: 'Olivenolje', specification: '' }];
	let holdNextGet = false;
	let releaseHeldGet: (() => void) | undefined;
	let markHeldGetStarted: () => void = () => undefined;
	const heldGetStarted = new Promise<void>((resolve) => {
		markHeldGetStarted = resolve;
	});
	await page.route('**/api/shopping-list{,/items}', async (route) => {
		const request = route.request();
		if (request.method() === 'GET') {
			const responseItems = items.map((item) => ({ ...item }));
			if (holdNextGet) {
				holdNextGet = false;
				markHeldGetStarted();
				await new Promise<void>((resolve) => {
					releaseHeldGet = resolve;
				});
			}
			await route.fulfill({
				json: {
					listUuid: 'trip-list',
					listName: 'Kroatia 2026',
					items: responseItems,
					recentItems: [],
					fetchedAt: '2026-08-21T10:00:00.000Z'
				}
			});
			return;
		}
		const body = request.postDataJSON() as { name: string; specification: string };
		items = [
			{ sourceName: body.name, name: body.name, specification: body.specification },
			...items
		];
		await route.fulfill({
			json: {
				listUuid: 'trip-list',
				listName: 'Kroatia 2026',
				items,
				recentItems: [],
				fetchedAt: '2026-08-21T10:00:01.000Z'
			}
		});
	});
	await login(page);
	await page.goto('/shopping-list');
	await expect(page.getByText('Olivenolje', { exact: true })).toBeVisible();

	items = [{ sourceName: 'Brot', name: 'Brød', specification: '' }, ...items];
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(page.getByText('Brød', { exact: true })).toBeVisible();

	holdNextGet = true;
	await heldGetStarted;
	await expect(page.getByRole('status')).not.toContainText('Oppdaterer');
	await page.getByRole('textbox', { name: 'Vare' }).fill('Melk');
	await expect(page.getByRole('button', { name: 'Legg til', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Legg til', exact: true }).click();
	await expect(page.getByText('Melk', { exact: true })).toBeVisible();

	const staleResponse = page.waitForResponse(
		(response) =>
			response.request().method() === 'GET' &&
			new URL(response.url()).pathname === '/api/shopping-list'
	);
	if (!releaseHeldGet) {
		throw new Error('Polling request was not held');
	}
	releaseHeldGet();
	await staleResponse;
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	await expect(page.getByText('Melk', { exact: true })).toBeVisible();
});

test('shows the cached list read-only without network access', async ({ context, page }) => {
	let apiAvailable = true;
	await page.route('**/api/shopping-list', async (route) => {
		if (!apiAvailable) {
			await route.abort('internetdisconnected');
			return;
		}
		await route.fulfill({
			json: {
				listUuid: 'trip-list',
				listName: 'Kroatia 2026',
				items: [{ sourceName: 'Sonnencreme', name: 'Solkrem', specification: 'Faktor 50' }],
				recentItems: [{ sourceName: 'Eier', name: 'Egg', specification: '' }],
				fetchedAt: '2026-08-21T10:00:00.000Z'
			}
		});
	});
	await login(page);
	await page.goto('/shopping-list');
	await expect(page.getByText('Solkrem')).toBeVisible();
	await page.waitForFunction(async (): Promise<boolean> => {
		const keys = await caches.keys();
		const pageCache = keys.find((key) => key.startsWith('gjemmekontor-pages-'));
		if (!pageCache) {
			return false;
		}
		return Boolean(await (await caches.open(pageCache)).match('/shopping-list'));
	});

	apiAvailable = false;
	await context.setOffline(true);
	await page.reload();

	await expect(page.getByText('Solkrem')).toBeVisible();
	await expect(page.getByText('Faktor 50')).toBeVisible();
	await expect(page.getByRole('status')).toContainText(/Uten nett|Viser lagret liste/);
	await expect(page.getByRole('textbox', { name: 'Vare' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Marker Solkrem som kjøpt' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Endre Solkrem' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Legg Egg tilbake på listen' })).toBeDisabled();
});

test('explains when no shopping list has been cached offline', async ({ context, page }) => {
	await page.route('**/api/shopping-list', async (route) => route.abort('failed'));
	await login(page);
	await page.goto('/shopping-list');
	await expect(page.getByRole('alert')).toContainText('Bring er ikke tilgjengelig akkurat nå.');

	await context.setOffline(true);
	await page.reload();

	await expect(page.getByRole('heading', { name: 'Ingen lagret handleliste' })).toBeVisible();
	await expect(page.getByText('Åpne listen én gang når du har nett.')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Vare' })).toBeDisabled();
});
