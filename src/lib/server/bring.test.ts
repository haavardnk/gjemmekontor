import { describe, expect, test, vi } from 'vitest';

import {
	type BringClient,
	BringService,
	BringServiceError,
	handleAddHandlelisteItem,
	handleCompleteHandlelisteItem,
	handleEditHandlelisteItem,
	handleGetHandleliste
} from './bring';
import type { BringConfig } from './env';

const config: BringConfig = {
	email: 'crew@example.com',
	password: 'bring-password',
	listUuid: 'trip-list'
};

function fakeClient(initial = [{ name: 'Øl', specification: '6 bokser' }]): BringClient & {
	items: Array<{ name: string; specification: string }>;
	recentItems: Array<{ name: string; specification: string }>;
} {
	const client = {
		items: [...initial],
		recentItems: [{ name: 'Eier', specification: '' }],
		login: vi.fn(async (): Promise<void> => undefined),
		loadLists: vi.fn(async () => ({ lists: [{ listUuid: 'trip-list', name: 'Kroatia' }] })),
		loadCatalog: vi.fn(async () => ({
			catalog: {
				sections: [
					{
						sectionId: 'drinks',
						items: [
							{ itemId: 'Bier', name: 'Øl' },
							{ itemId: 'Milch', name: 'Melk' }
						]
					},
					{
						sectionId: 'fruit',
						items: [{ itemId: 'Appelsin', name: 'Appelsin' }]
					}
				]
			}
		})),
		getUserSettings: vi.fn(async () => ({
			userlistsettings: [
				{
					listUuid: 'trip-list',
					usersettings: [{ key: 'listSectionOrder', value: '["fruit","drinks","Eigene Artikel"]' }]
				}
			]
		})),
		getItems: vi.fn(async () => ({
			purchase: [...client.items],
			recently: [...client.recentItems]
		})),
		saveItem: vi.fn(async (_listUuid: string, name: string, specification: string) => {
			client.items = [
				...client.items.filter((item) => item.name !== name),
				{ name, specification }
			];
			client.recentItems = client.recentItems.filter((item) => item.name !== name);
			return '';
		}),
		moveToRecentList: vi.fn(async (_listUuid: string, name: string) => {
			const completed = client.items.find((item) => item.name === name);
			client.items = client.items.filter((item) => item.name !== name);
			if (completed) {
				client.recentItems = [...client.recentItems, completed];
			}
			return '';
		})
	};
	return client;
}

describe('Bring service', (): void => {
	test('logs in once, validates the configured list, and normalizes active items', async (): Promise<void> => {
		const client = fakeClient([
			{ name: ' Bier ', specification: ' 6 bokser ' },
			{ name: 'Appelsin', specification: '' },
			{ name: 'Appelsin', specification: '4 stk' },
			{ name: '', specification: '' }
		]);
		const service = new BringService(
			config,
			() => client,
			() => new Date('2026-08-21T10:00:00Z')
		);

		const first = await service.snapshot();
		const second = await service.snapshot();

		expect(first).toEqual({
			listUuid: 'trip-list',
			listName: 'Kroatia',
			items: [
				{ sourceName: 'Appelsin', name: 'Appelsin', specification: '' },
				{ sourceName: 'Appelsin', name: 'Appelsin', specification: '4 stk' },
				{ sourceName: 'Bier', name: 'Øl', specification: '6 bokser' }
			],
			recentItems: [{ sourceName: 'Eier', name: 'Eier', specification: '' }],
			fetchedAt: '2026-08-21T10:00:00.000Z'
		});
		expect(second).toEqual(first);
		expect(client.login).toHaveBeenCalledTimes(1);
		expect(client.loadLists).toHaveBeenCalledTimes(1);
	});

	test('rejects missing configuration and an inaccessible list', async (): Promise<void> => {
		await expect(new BringService(undefined).snapshot()).rejects.toMatchObject({
			code: 'BRING_NOT_CONFIGURED'
		});
		const client = fakeClient();
		client.loadLists = vi.fn(async () => ({ lists: [{ listUuid: 'other', name: 'Other' }] }));

		await expect(new BringService(config, () => client).snapshot()).rejects.toMatchObject({
			code: 'BRING_LIST_NOT_FOUND'
		});
	});

	test('adds, completes, and restores items after authoritative verification', async (): Promise<void> => {
		const client = fakeClient([{ name: 'Appelsin', specification: '' }]);
		const service = new BringService(config, () => client);

		const added = await service.add('Melk', '2 liter');
		const edited = await service.edit('Milch', '3 liter');
		const completed = await service.complete('Milch');
		const restored = await service.add('Melk', '2 liter');

		expect(added.items).toEqual([
			{ sourceName: 'Appelsin', name: 'Appelsin', specification: '' },
			{ sourceName: 'Milch', name: 'Melk', specification: '2 liter' }
		]);
		expect(completed.items).toEqual([
			{ sourceName: 'Appelsin', name: 'Appelsin', specification: '' }
		]);
		expect(edited.items.at(-1)).toEqual({
			sourceName: 'Milch',
			name: 'Melk',
			specification: '3 liter'
		});
		expect(completed.recentItems.at(-1)).toEqual({
			sourceName: 'Milch',
			name: 'Melk',
			specification: '3 liter'
		});
		expect(restored.items).toEqual([
			{ sourceName: 'Appelsin', name: 'Appelsin', specification: '' },
			{ sourceName: 'Milch', name: 'Melk', specification: '2 liter' }
		]);
		expect(client.saveItem).toHaveBeenCalledWith('trip-list', 'Milch', '2 liter');
		expect(client.moveToRecentList).toHaveBeenCalledWith('trip-list', 'Milch');
	});

	test('fails a mutation when Bring does not reflect it', async (): Promise<void> => {
		const client = fakeClient([]);
		client.saveItem = vi.fn(async () => '');
		const service = new BringService(config, () => client);

		await expect(service.add('Melk', '')).rejects.toEqual(
			new BringServiceError('BRING_MUTATION_FAILED')
		);
	});

	test('re-authenticates once after an expired access token', async (): Promise<void> => {
		const expired = fakeClient();
		expired.getItems = vi.fn(async () => {
			throw new Error('JWT access token is not valid');
		});
		const fresh = fakeClient([{ name: 'Milch', specification: '' }]);
		const clients = [expired, fresh];
		const service = new BringService(config, () => clients.shift() as BringClient);

		const snapshot = await service.snapshot();

		expect(snapshot.items).toEqual([{ sourceName: 'Milch', name: 'Melk', specification: '' }]);
		expect(snapshot.recentItems).toEqual([{ sourceName: 'Eier', name: 'Eier', specification: '' }]);
		expect(expired.login).toHaveBeenCalledOnce();
		expect(fresh.login).toHaveBeenCalledOnce();
	});

	test('serializes overlapping mutations', async (): Promise<void> => {
		const client = fakeClient([]);
		let active = 0;
		let maximumActive = 0;
		client.saveItem = vi.fn(async (_listUuid, name, specification) => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			client.items = [...client.items, { name, specification }];
			active -= 1;
			return '';
		});
		const service = new BringService(config, () => client);

		await Promise.all([service.add('Melk', ''), service.add('Brød', '')]);

		expect(maximumActive).toBe(1);
	});

	test('validates handlers and returns stable errors', async (): Promise<void> => {
		const service = new BringService(config, () => fakeClient([]));
		const invalid = await handleAddHandlelisteItem(
			new Request('http://localhost/api/handleliste/items', {
				method: 'POST',
				body: JSON.stringify({ name: '', specification: '', listUuid: 'other' })
			}),
			service
		);
		const notConfigured = await handleGetHandleliste(new BringService(undefined));
		const malformed = await handleCompleteHandlelisteItem(
			new Request('http://localhost/api/handleliste/items', { method: 'PATCH', body: '{' }),
			service
		);
		const invalidEdit = await handleEditHandlelisteItem(
			new Request('http://localhost/api/handleliste/items', {
				method: 'PUT',
				body: JSON.stringify({ sourceName: 'Milch', specification: '', name: 'Ny' })
			}),
			service
		);

		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({ error: 'INVALID_REQUEST' });
		expect(notConfigured.status).toBe(503);
		expect(await notConfigured.json()).toEqual({ error: 'BRING_NOT_CONFIGURED' });
		expect(malformed.status).toBe(400);
		expect(invalidEdit.status).toBe(400);
	});
});
