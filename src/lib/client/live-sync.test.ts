import { describe, expect, test, vi } from 'vitest';

import { LiveSync } from './live-sync';

class FakeEventSource extends EventTarget {
	closed = false;

	close(): void {
		this.closed = true;
	}

	sync(data: unknown): void {
		this.dispatchEvent(new MessageEvent('sync', { data: JSON.stringify(data) }));
	}

	raw(data: string): void {
		this.dispatchEvent(new MessageEvent('sync', { data }));
	}
}

describe('live sync', (): void => {
	test('refreshes shared state and targeted modules', async (): Promise<void> => {
		const source = new FakeEventSource();
		const refreshModules = vi.fn(async () => undefined);
		const refreshState = vi.fn(async () => undefined);
		const activateVersion = vi.fn(async () => undefined);
		const liveSync = new LiveSync({
			createEventSource: () => source as unknown as EventSource,
			refreshModules,
			refreshState,
			activateVersion
		});
		liveSync.start('trip a', '1.0.0');

		source.sync({
			state: true,
			modules: ['shopping-list', 'shopping-list', 'gear'],
			reload: false,
			version: '1.0.1'
		});

		expect(refreshState).toHaveBeenCalledOnce();
		expect(refreshModules).toHaveBeenCalledTimes(2);
		expect(refreshModules).toHaveBeenNthCalledWith(1, 'shopping-list');
		expect(refreshModules).toHaveBeenNthCalledWith(2, 'gear');
		expect(activateVersion).toHaveBeenCalledWith('1.0.0', '1.0.1');
		liveSync.stop();
		expect(source.closed).toBe(true);
	});

	test('reloads for trip configuration changes', (): void => {
		const source = new FakeEventSource();
		const reload = vi.fn();
		const refreshState = vi.fn(async () => undefined);
		const liveSync = new LiveSync({
			createEventSource: () => source as unknown as EventSource,
			refreshModules: async () => undefined,
			refreshState,
			reload
		});
		liveSync.start('trip-a');

		source.sync({ state: true, modules: [], reload: true });

		expect(reload).toHaveBeenCalledOnce();
		expect(refreshState).not.toHaveBeenCalled();
	});

	test('ignores malformed events', (): void => {
		const source = new FakeEventSource();
		const refreshState = vi.fn(async () => undefined);
		const liveSync = new LiveSync({
			createEventSource: () => source as unknown as EventSource,
			refreshModules: async () => undefined,
			refreshState
		});
		liveSync.start('trip-a');

		source.raw('{');
		source.sync({ state: 'yes', modules: [], reload: false });

		expect(refreshState).not.toHaveBeenCalled();
	});
});
