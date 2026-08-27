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
	}, new Date('2026-09-06T10:00:00.000Z').valueOf());
}

async function login(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Passord', exact: true }).fill('test-password');
	await page.getByRole('button', { name: 'Logg inn' }).click();
	await expect(page).toHaveURL(/\/map$/);
}

test.use({ viewport: { width: 390, height: 844 } });

test('starts a fixed rotation and keeps a numbered rule book', async ({ page }) => {
	await useSecondTripDay(page);
	await login(page);
	await page.getByRole('button', { name: 'Mer' }).click();
	await page.getByRole('dialog').getByRole('link', { name: 'Regelbok' }).click();

	await expect(page).toHaveURL(/\/rule-book$/);
	await expect(page.getByRole('heading', { name: 'Regelboka', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mer' })).toHaveAttribute('aria-current', 'page');

	const firstName = `Ada ${crypto.randomUUID().slice(0, 8)}`;
	const secondName = `Bo ${crypto.randomUUID().slice(0, 8)}`;
	const participantInput = page.getByRole('textbox', { name: 'Navn på person' });
	for (const name of [firstName, secondName]) {
		await participantInput.fill(name);
		await page.getByRole('button', { name: 'Legg til' }).click();
		await expect(page.getByRole('textbox', { name: `Navn på ${name}` })).toBeVisible();
	}

	await page.getByRole('button', { name: 'Start spillet' }).click();
	await expect(
		page.getByText(new RegExp(`(${firstName}|${secondName}) lager dagens regel`), { exact: true })
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

	await page.getByText('Rekkefølge', { exact: true }).click();
	await expect(page.getByRole('listitem').filter({ hasText: firstName })).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: secondName })).toBeVisible();

	const rule = `Den siste som står opp lager kaffe ${crypto.randomUUID().slice(0, 8)}`;
	await page.getByRole('textbox', { name: '§ 1' }).fill(rule);
	await page.getByRole('button', { name: 'Legg til regel' }).click();
	await expect(page.getByRole('textbox', { name: 'Rediger § 1' })).toHaveValue(rule);
	await expect(page.getByText('Mandag 7. september', { exact: true })).toBeVisible();
	await expect(
		page.getByText(new RegExp(`(${firstName}|${secondName}) lager den neste regelen`), {
			exact: true
		})
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Endre deltakere' })).toHaveCount(0);

	const missedRule = `Alle må bade før frokost ${crypto.randomUUID().slice(0, 8)}`;
	await page
		.getByRole('combobox', { name: 'Velg dag' })
		.selectOption({ label: 'Lørdag 5. september' });
	await page.getByRole('textbox', { name: '§ 2' }).fill(missedRule);
	await page.getByRole('button', { name: 'Legg til regel' }).click();

	const book = page.getByRole('heading', { name: 'Regelboka', level: 2 }).locator('..');
	await expect(book.getByText('§ 1', { exact: true })).toBeVisible();
	await expect(book.getByText(rule, { exact: true })).toBeVisible();
	await expect(book.getByText('§ 2', { exact: true })).toBeVisible();
	await expect(book.getByText(missedRule, { exact: true })).toBeVisible();
	await expect(book).not.toContainText(firstName);
	await expect(book).not.toContainText(secondName);

	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Rediger § 1' })).toHaveValue(rule);
	await expect(page.getByText(rule, { exact: true })).toBeVisible();
	await expect(page.getByText(missedRule, { exact: true })).toBeVisible();

	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
