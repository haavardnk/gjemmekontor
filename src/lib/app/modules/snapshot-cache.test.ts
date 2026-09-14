import { beforeEach, describe, expect, test, vi } from 'vitest';

const { apiRequest, storeSnapshot } = vi.hoisted(() => ({
	apiRequest: vi.fn(),
	storeSnapshot: vi.fn()
}));

vi.mock('$lib/client/api', () => ({ apiRequest }));
vi.mock('$lib/client/cached-resources.svelte', () => ({
	cachedResources: { storeSnapshot }
}));

import { warmEnabledSnapshots } from './snapshot-cache';

beforeEach((): void => {
	apiRequest.mockReset();
	storeSnapshot.mockReset();
});

describe('snapshot cache warming', (): void => {
	test('warms only enabled structured modules', async (): Promise<void> => {
		apiRequest.mockImplementation(async (endpoint: string): Promise<unknown> => {
			if (endpoint === '/api/gear') return { people: [], categories: [], items: [] };
			if (endpoint === '/api/menu') return { archives: [], dishes: [] };
			throw new Error(`Unexpected endpoint ${endpoint}`);
		});

		await warmEnabledSnapshots(['gear', 'menu']);

		expect(apiRequest).toHaveBeenCalledTimes(2);
		expect(storeSnapshot).toHaveBeenCalledWith('gear:snapshot:current', {
			people: [],
			categories: [],
			items: []
		});
		expect(storeSnapshot).toHaveBeenCalledWith('menu:snapshot:current', {
			archives: [],
			dishes: []
		});
	});

	test('continues warming after one provider fails', async (): Promise<void> => {
		apiRequest.mockImplementation(async (endpoint: string): Promise<unknown> => {
			if (endpoint === '/api/gear') throw new TypeError('network');
			if (endpoint === '/api/menu') return { archives: [], dishes: [] };
			throw new Error(`Unexpected endpoint ${endpoint}`);
		});

		await warmEnabledSnapshots(['gear', 'menu']);

		expect(storeSnapshot).toHaveBeenCalledOnce();
		expect(storeSnapshot).toHaveBeenCalledWith('menu:snapshot:current', {
			archives: [],
			dishes: []
		});
	});
});
