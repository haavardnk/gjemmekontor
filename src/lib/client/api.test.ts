import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiError, apiRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
	test('serializes JSON requests and returns the response body', async () => {
		const fetcher = vi.fn(async () => Response.json({ saved: true }));
		vi.stubGlobal('fetch', fetcher);

		await expect(
			apiRequest('/api/items', { method: 'POST', json: { name: 'Tau' } })
		).resolves.toEqual({ saved: true });
		expect(fetcher).toHaveBeenCalledWith('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Tau' })
		});
	});

	test('throws typed server errors', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ error: 'ITEM_INVALID' }, { status: 400 }));

		await expect(apiRequest('/api/items')).rejects.toEqual(new ApiError('ITEM_INVALID', 400));
	});
});
