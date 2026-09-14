import { afterEach, describe, expect, test, vi } from 'vitest';

import { activateAppVersion } from './pwa';

afterEach((): void => {
	vi.unstubAllGlobals();
});

describe('app version activation', (): void => {
	test('updates the service worker and reloads once for a new version', async (): Promise<void> => {
		const update = vi.fn(async () => undefined);
		const reload = vi.fn();
		const values = new Map<string, string>();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value)
		});
		vi.stubGlobal('navigator', {
			serviceWorker: { getRegistration: vi.fn(async () => ({ update })) }
		});
		vi.stubGlobal('window', { location: { reload } });

		await activateAppVersion('1.0.0', '1.0.1');
		await activateAppVersion('1.0.0', '1.0.1');

		expect(update).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	test('does nothing without a genuine release mismatch', async (): Promise<void> => {
		const reload = vi.fn();
		vi.stubGlobal('sessionStorage', { getItem: vi.fn(), setItem: vi.fn() });
		vi.stubGlobal('navigator', {});
		vi.stubGlobal('window', { location: { reload } });

		await activateAppVersion('1.0.0', '1.0.0');
		await activateAppVersion(undefined, '1.0.1');
		await activateAppVersion('1.0.0', null);

		expect(reload).not.toHaveBeenCalled();
	});
});
