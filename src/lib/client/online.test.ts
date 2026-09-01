import { describe, expect, test, vi } from 'vitest';

import { watchOnlineStatus } from './online';

describe('online status', () => {
	test('publishes the current status and follows browser connectivity events', () => {
		const target = new EventTarget();
		const update = vi.fn();
		let online = true;
		const stop = watchOnlineStatus(update, { target, read: () => online });

		expect(update).toHaveBeenLastCalledWith(true);

		online = false;
		target.dispatchEvent(new Event('offline'));
		expect(update).toHaveBeenLastCalledWith(false);

		stop();
		online = true;
		target.dispatchEvent(new Event('online'));
		expect(update).toHaveBeenCalledTimes(2);
	});
});
