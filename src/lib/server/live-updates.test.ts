import { describe, expect, test, vi } from 'vitest';

import { LiveUpdateHub } from './live-updates';

describe('live update hub', (): void => {
	test('publishes only to the matching trip and unsubscribes cleanly', (): void => {
		const hub = new LiveUpdateHub();
		const first = vi.fn();
		const second = vi.fn();
		const stopFirst = hub.subscribe('trip-a', first);
		hub.subscribe('trip-b', second);
		const update = { state: true, modules: [], reload: false };

		hub.publish('trip-a', update);
		stopFirst();
		hub.publish('trip-a', update);

		expect(first).toHaveBeenCalledOnce();
		expect(first).toHaveBeenCalledWith(update);
		expect(second).not.toHaveBeenCalled();
	});
});
