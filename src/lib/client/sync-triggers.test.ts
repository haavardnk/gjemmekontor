import { describe, expect, test, vi } from 'vitest';

import { startSyncTriggers } from './sync-triggers';

describe('sync triggers', (): void => {
	test('registers one lifecycle and removes every listener and timer', (): void => {
		const windowTarget = new EventTarget();
		const documentTarget = new EventTarget();
		const trigger = vi.fn();
		const timer = setInterval(() => undefined, 60_000);
		const setTimer = vi.fn(() => timer);
		const clearTimer = vi.fn(clearInterval);
		const stop = startSyncTriggers(
			trigger,
			{ includeOffline: true, intervalMs: 123 },
			{
				windowTarget,
				documentTarget,
				setInterval: setTimer,
				clearInterval: clearTimer
			}
		);

		windowTarget.dispatchEvent(new Event('online'));
		windowTarget.dispatchEvent(new Event('offline'));
		windowTarget.dispatchEvent(new Event('focus'));
		documentTarget.dispatchEvent(new Event('visibilitychange'));
		expect(trigger).toHaveBeenCalledTimes(4);
		expect(setTimer).toHaveBeenCalledWith(trigger, 123);

		stop();
		windowTarget.dispatchEvent(new Event('online'));
		documentTarget.dispatchEvent(new Event('visibilitychange'));
		expect(trigger).toHaveBeenCalledTimes(4);
		expect(clearTimer).toHaveBeenCalledWith(timer);
	});

	test('does not subscribe to offline events unless requested', (): void => {
		const windowTarget = new EventTarget();
		const trigger = vi.fn();
		const stop = startSyncTriggers(
			trigger,
			{},
			{
				windowTarget,
				setInterval: () => setInterval(() => undefined, 60_000),
				clearInterval
			}
		);
		windowTarget.dispatchEvent(new Event('offline'));
		expect(trigger).not.toHaveBeenCalled();
		stop();
	});
});
