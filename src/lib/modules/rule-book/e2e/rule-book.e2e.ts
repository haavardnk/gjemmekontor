import { expect, type Page, test } from '@playwright/test';

async function useSecondTripDay(page: Page): Promise<void> {
	await page.addInitScript((fixedTime: number) => {
		const OriginalDate = Date;
		class FixedDate extends OriginalDate {
			constructor(...args: [] | [string | number]) {
				if (args.length === 0) super(fixedTime);
				else super(args[0]);
			}

			static override now(): number {
				return fixedTime;
			}
		}
		Object.defineProperty(window, 'Date', { configurable: true, value: FixedDate });
	}, new Date('2027-06-02T10:00:00.000Z').valueOf());
}

async function login(page: Page): Promise<void> {
	await page.goto('/t/testreise/unlock');
	await page.locator('#password').fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

test('keeps the synchronized rule book readable and disables changes offline', async ({
	context,
	page
}) => {
	await useSecondTripDay(page);
	await login(page);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Regelbok' }).click();

	await expect(page).toHaveURL(/\/rule-book$/);
	await expect(page.getByRole('heading', { name: 'Regelboka', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mer' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByLabel('Tilgjengelig uten nett')).toBeVisible();
	const includedNames = ['Ada', 'Bo'];
	const excludedNames = ['Cleo', 'Dina', 'Eli', 'Finn'];
	for (const name of [...includedNames, ...excludedNames]) {
		await expect(page.getByRole('checkbox', { name })).toBeChecked();
	}
	for (const name of excludedNames) {
		await page.getByRole('checkbox', { name }).uncheck();
	}

	await page.getByRole('button', { name: 'Start spillet' }).click();
	await expect(
		page.getByText(new RegExp(`(${includedNames.join('|')}) lager dagens regel`), { exact: true })
	).toBeVisible();
	const editParticipantsButton = page.getByRole('button', { name: 'Endre deltakere' });
	await expect(editParticipantsButton).toBeVisible();
	await expect(editParticipantsButton.getByText('Deltakere', { exact: true })).toBeVisible();
	let confirmationMessage = '';
	page.once('dialog', async (dialog) => {
		confirmationMessage = dialog.message();
		await dialog.dismiss();
	});
	await editParticipantsButton.click();
	expect(confirmationMessage).toBe('Vil du endre deltakerne? Det trekkes en ny rekkefølge.');

	const participantOrder = page.getByText('Rekkefølge', { exact: true }).locator('..');
	await participantOrder.getByText('Rekkefølge', { exact: true }).click();
	for (const name of includedNames) {
		await expect(participantOrder.getByRole('listitem').filter({ hasText: name })).toBeVisible();
	}
	for (const name of excludedNames) {
		await expect(participantOrder.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
	}

	const rule = `Den siste som står opp lager kaffe ${crypto.randomUUID().slice(0, 8)}`;
	await page.getByRole('textbox', { name: '§ 2' }).fill(rule);
	await page.getByRole('button', { name: 'Legg til regel' }).click();
	await expect(page.getByRole('textbox', { name: 'Rediger § 2' })).toHaveValue(rule);
	await expect(page.getByText('Testdag 3', { exact: true })).toBeVisible();
	await expect(
		page.getByText(new RegExp(`(${includedNames.join('|')}) lager den neste regelen`), {
			exact: true
		})
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Endre deltakere' })).toHaveCount(0);
	const book = page.getByRole('heading', { name: 'Regelboka', level: 2 }).locator('..');
	const sections = book.getByRole('listitem');
	await expect(sections).toHaveCount(2);
	await expect(sections.nth(0)).toContainText('§ 1');
	await expect(sections.nth(0)).toContainText(
		new RegExp(`(${includedNames.join('|')}) har ikke lagt inn`)
	);
	await expect(sections.nth(1)).toContainText('§ 2');
	await expect(sections.nth(1)).toContainText(rule);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Rediger § 2' })).toHaveValue(rule);
	await expect(page.getByRole('textbox', { name: 'Rediger § 2' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Lagre endring' })).toBeDisabled();
	await expect(page.getByRole('status')).toContainText('Uten nett · kun lesing');
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByRole('status')).toHaveText('Synkronisert', { timeout: 15_000 });

	const missedRule = `Alle må bade før frokost ${crypto.randomUUID().slice(0, 8)}`;
	await page.getByRole('combobox', { name: 'Velg dag' }).selectOption({ label: 'Testdag 1' });
	await page.getByRole('textbox', { name: '§ 1' }).fill(missedRule);
	await page.getByRole('button', { name: 'Legg til regel' }).click();

	await expect(sections.nth(0)).toContainText('§ 1');
	await expect(sections.nth(0)).toContainText(missedRule);
	await expect(sections.nth(1)).toContainText('§ 2');
	await expect(sections.nth(1)).toContainText(rule);
	for (const name of includedNames) {
		await expect(book).not.toContainText(name);
	}

	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Rediger § 2' })).toHaveValue(rule);
	await expect(page.getByText(rule, { exact: true })).toBeVisible();
	await expect(page.getByText(missedRule, { exact: true })).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
