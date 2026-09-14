import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConnectivityState } from './connectivity.svelte';

afterEach((): void => {
	vi.unstubAllGlobals();
});

describe('connectivity state', (): void => {
	test('reads current browser state and follows connectivity events', (): void => {
		const target = new EventTarget();
		const navigatorState = { onLine: false };
		vi.stubGlobal('window', target);
		vi.stubGlobal('navigator', navigatorState);
		const connectivity = new ConnectivityState();

		connectivity.start();
		expect(connectivity.online).toBe(false);

		navigatorState.onLine = true;
		target.dispatchEvent(new Event('online'));
		expect(connectivity.online).toBe(true);

		connectivity.stop();
	});
});
