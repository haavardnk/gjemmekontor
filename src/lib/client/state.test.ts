import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { openClientDatabase } from './database';
import { SharedState } from './state.svelte';

const databaseNames: string[] = [];

afterEach(async (): Promise<void> => {
	for (const name of databaseNames.splice(0)) {
		await deleteDB(name);
	}
});

function databaseName(): string {
	const name = `gjemmekontor-test-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

describe('client state', (): void => {
	test('creates all typed stores', async (): Promise<void> => {
		const db = await openClientDatabase(databaseName());

		expect(Array.from(db.objectStoreNames)).toEqual([
			'mapSnapshot',
			'meta',
			'mutations',
			'offlineMap',
			'state'
		]);
		db.close();
	});

	test('persists optimistic state and mutation in one operation', async (): Promise<void> => {
		const name = databaseName();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => new Promise<Response>(() => undefined)),
			now: (): number => 1_000,
			randomId: (): string => 'mutation-1'
		});

		await state.set('day:one', { complete: true });
		const db = await openClientDatabase(name);
		const saved = await db.get('state', 'day:one');
		const mutation = await db.get('mutations', 'mutation-1');
		db.close();
		await state.close();

		expect(saved?.value).toEqual({ complete: true });
		expect(mutation).toMatchObject({ key: 'day:one', value: { complete: true } });
		expect(state.values['day:one']).toEqual({ complete: true });
	});

	test('preserves an edit started while initialization is running', async (): Promise<void> => {
		const name = databaseName();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => new Promise<Response>(() => undefined)),
			randomId: (): string => 'mutation-race'
		});

		const initializing = state.initialize();
		const writing = state.set('day:race', 'kept');
		await Promise.all([initializing, writing]);

		expect(state.ready).toBe(true);
		expect(state.values['day:race']).toBe('kept');
		await state.close();
	});

	test('returns one persistent client ID', async (): Promise<void> => {
		const state = new SharedState({ databaseName: databaseName() });

		const first = await state.clientId();
		const second = await state.clientId();
		await state.close();

		expect(second).toBe(first);
		expect(first).toMatch(/^[0-9a-f-]{36}$/);
	});

	test('writes with the default mutation ID generator', async (): Promise<void> => {
		const name = databaseName();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => new Promise<Response>(() => undefined))
		});

		await state.set('default:id', true);
		const database = await openClientDatabase(name);
		const mutations = await database.getAll('mutations');
		database.close();
		await state.close();

		expect(mutations).toHaveLength(1);
		expect(mutations[0]?.mutationId).toMatch(/^[0-9a-f-]{36}$/);
	});

	test('pushes pending mutations before pulling state', async (): Promise<void> => {
		const name = databaseName();
		const calls: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const url = String(input);
			calls.push(url);
			if (url === '/api/state/sync') {
				return Response.json({ revision: 1, acknowledgedMutationIds: ['mutation-1'] });
			}
			return Response.json({
				revision: 2,
				entries: [
					{
						key: 'remote:key',
						value: 'remote',
						revision: 2,
						clientId: 'client-b',
						mutationId: 'mutation-2',
						updatedAt: '2026-08-20T00:00:00.000Z'
					}
				]
			});
		});
		const state = new SharedState({
			databaseName: name,
			fetcher,
			now: (): number => 1_000,
			randomId: (): string => 'mutation-1'
		});
		const db = await openClientDatabase(name);
		await db.put('mutations', {
			mutationId: 'mutation-1',
			clientId: 'client-a',
			key: 'local:key',
			value: 'local',
			clientTimestamp: 1_000
		});

		await state.sync();
		const mutationCount = await db.count('mutations');
		db.close();
		await state.close();

		expect(calls).toEqual(['/api/state/sync', '/api/state?since=0']);
		expect(mutationCount).toBe(0);
		expect(state.values['remote:key']).toBe('remote');
		expect(state.status).toEqual({ phase: 'synced', pending: 0 });
	});
});
