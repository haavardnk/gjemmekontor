import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { openClientDatabase } from './database';
import { SharedState } from './state.svelte';

const extraction = {
	version: 1 as const,
	name: 'Tur',
	departureAt: '2026-09-05T08:00:00.000Z',
	arrivalAt: '2026-09-05T09:00:00.000Z',
	nauticalMiles: 4,
	activeSeconds: 3_000,
	elapsedSeconds: 3_600,
	stationarySeconds: 600,
	originalPointCount: 100,
	routePointCount: 2,
	segments: [[[16, 43] as [number, number], [16.1, 43.1] as [number, number]]],
	stationaryBlocks: [],
	recordingGaps: []
};

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
			'handlelisteSnapshot',
			'mapSnapshot',
			'meta',
			'mutations',
			'offlineMap',
			'pendingGpxUploads',
			'state'
		]);
		db.close();
	});

	test('persists a leg mutation and GPX blob atomically', async (): Promise<void> => {
		const name = databaseName();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => new Promise<Response>(() => undefined)),
			now: (): number => 1_000,
			randomId: (): string => 'mutation-gpx'
		});

		await state.setWithGpx(
			'logbook:d0:leg:leg-a',
			{ gpxId: 'gpx-a' },
			{
				id: 'gpx-a',
				legKey: 'logbook:d0:leg:leg-a',
				filename: 'orca.gpx',
				contentType: 'application/gpx+xml',
				checksum: 'abc',
				data: new Blob(['gpx']),
				createdAt: 1_000,
				parserVersion: 1,
				extraction
			}
		);
		const db = await openClientDatabase(name);
		const saved = await db.get('state', 'logbook:d0:leg:leg-a');
		const mutation = await db.get('mutations', 'mutation-gpx');
		const upload = await db.get('pendingGpxUploads', 'gpx-a');
		db.close();
		await state.close();

		expect(saved?.value).toEqual({ gpxId: 'gpx-a' });
		expect(mutation?.key).toBe('logbook:d0:leg:leg-a');
		expect(mutation?.sequence).toBe(1);
		expect(await upload?.data.text()).toBe('gpx');
		expect(state.isGpxUploadPending('gpx-a')).toBe(true);
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

	test('archives pending GPX before its leg mutation and verifies extraction parity', async (): Promise<void> => {
		const name = databaseName();
		const calls: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const url = String(input);
			calls.push(url);
			if (url === '/api/state/sync') {
				return Response.json({ revision: 1, acknowledgedMutationIds: ['mutation-gpx'] });
			}
			if (url.startsWith('/api/logbook/gpx/gpx-a?')) {
				return Response.json({ checksum: 'abc', parserVersion: 1, extraction });
			}
			return Response.json({ revision: 1, entries: [] });
		});
		const state = new SharedState({ databaseName: name, fetcher });
		const db = await openClientDatabase(name);
		await db.put('mutations', {
			mutationId: 'mutation-gpx',
			clientId: 'client-a',
			key: 'logbook:d0:leg:leg-a',
			value: { gpxId: 'gpx-a' },
			clientTimestamp: 1_000,
			sequence: 1
		});
		await db.put('pendingGpxUploads', {
			id: 'gpx-a',
			legKey: 'logbook:d0:leg:leg-a',
			filename: 'orca.gpx',
			contentType: 'application/gpx+xml',
			checksum: 'abc',
			data: new Blob(['gpx']),
			clientId: 'client-a',
			createdAt: 1_000,
			parserVersion: 1,
			extraction
		});

		await state.sync();
		const uploadCount = await db.count('pendingGpxUploads');
		db.close();
		await state.close();

		expect(calls[0]).toMatch(/^\/api\/logbook\/gpx\/gpx-a\?/);
		expect(calls[1]).toBe('/api/state/sync');
		expect(calls[2]).toBe('/api/state?since=0');
		expect(uploadCount).toBe(0);
		expect(state.isGpxUploadPending('gpx-a')).toBe(false);
	});

	test('replays pending mutations in durable sequence order', async (): Promise<void> => {
		const name = databaseName();
		let pushed: { mutationId: string; sequence?: number }[] = [];
		const fetcher = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
				if (String(input) === '/api/state/sync') {
					pushed = (JSON.parse(String(init?.body)) as { mutations: { mutationId: string }[] })
						.mutations;
					return Response.json({
						revision: 2,
						acknowledgedMutationIds: pushed.map((mutation) => mutation.mutationId)
					});
				}
				return Response.json({ revision: 2, entries: [] });
			}
		);
		const state = new SharedState({ databaseName: name, fetcher });
		const db = await openClientDatabase(name);
		await db.put('mutations', {
			mutationId: 'z-create',
			clientId: 'client-a',
			key: 'logbook:d0:leg:leg-a',
			value: { tombstone: false },
			clientTimestamp: 1_000,
			sequence: 1
		});
		await db.put('mutations', {
			mutationId: 'a-delete',
			clientId: 'client-a',
			key: 'logbook:d0:leg:leg-a',
			value: { tombstone: true },
			clientTimestamp: 1_000,
			sequence: 2
		});

		await state.sync();
		db.close();
		await state.close();

		expect(pushed.map((mutation) => mutation.mutationId)).toEqual(['z-create', 'a-delete']);
		expect(pushed.every((mutation) => mutation.sequence === undefined)).toBe(true);
	});

	test('archives an import added during sync before publishing its mutation', async (): Promise<void> => {
		const name = databaseName();
		const calls: string[] = [];
		let injected = false;
		const state = new SharedState({
			databaseName: name,
			fetcher: async (input, init): Promise<Response> => {
				const url = String(input);
				calls.push(url);
				if (url.startsWith('/api/logbook/gpx/gpx-a?') && !injected) {
					injected = true;
					await state.setWithGpx(
						'logbook:d0:leg:leg-b',
						{ gpxId: 'gpx-b' },
						{
							id: 'gpx-b',
							legKey: 'logbook:d0:leg:leg-b',
							filename: 'b.gpx',
							contentType: 'application/gpx+xml',
							checksum: 'abc',
							data: new Blob(['b']),
							createdAt: 2_000,
							parserVersion: 1,
							extraction
						}
					);
				}
				if (url.startsWith('/api/logbook/gpx/')) {
					return Response.json({ checksum: 'abc', parserVersion: 1, extraction });
				}
				if (url === '/api/state/sync') {
					const mutations = (
						JSON.parse(String(init?.body)) as { mutations: { mutationId: string }[] }
					).mutations;
					return Response.json({
						revision: mutations.length,
						acknowledgedMutationIds: mutations.map((mutation) => mutation.mutationId)
					});
				}
				return Response.json({ revision: 2, entries: [] });
			}
		});
		const db = await openClientDatabase(name);
		await db.put('mutations', {
			mutationId: 'mutation-a',
			clientId: 'client-a',
			key: 'logbook:d0:leg:leg-a',
			value: { gpxId: 'gpx-a' },
			clientTimestamp: 1_000,
			sequence: 1
		});
		await db.put('pendingGpxUploads', {
			id: 'gpx-a',
			legKey: 'logbook:d0:leg:leg-a',
			filename: 'a.gpx',
			contentType: 'application/gpx+xml',
			checksum: 'abc',
			data: new Blob(['a']),
			clientId: 'client-a',
			createdAt: 1_000,
			parserVersion: 1,
			extraction
		});

		await state.sync();
		const mutationCount = await db.count('mutations');
		const uploadCount = await db.count('pendingGpxUploads');
		db.close();
		await state.close();

		expect(calls.findIndex((call) => call.startsWith('/api/logbook/gpx/gpx-a?'))).toBeLessThan(
			calls.findIndex((call) => call === '/api/state/sync')
		);
		expect(calls.findIndex((call) => call.startsWith('/api/logbook/gpx/gpx-b?'))).toBeLessThan(
			calls.lastIndexOf('/api/state/sync')
		);
		expect(mutationCount).toBe(0);
		expect(uploadCount).toBe(0);
	});

	test('does not publish a leg when its GPX archive fails', async (): Promise<void> => {
		const name = databaseName();
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			return String(input).startsWith('/api/logbook/gpx/')
				? Response.json({ error: 'GPX_INVALID' }, { status: 400 })
				: Response.json({ revision: 0, acknowledgedMutationIds: [] });
		});
		const state = new SharedState({ databaseName: name, fetcher });
		const db = await openClientDatabase(name);
		await db.put('mutations', {
			mutationId: 'mutation-gpx',
			clientId: 'client-a',
			key: 'logbook:d0:leg:leg-a',
			value: { gpxId: 'gpx-a' },
			clientTimestamp: 1_000,
			sequence: 1
		});
		await db.put('pendingGpxUploads', {
			id: 'gpx-a',
			legKey: 'logbook:d0:leg:leg-a',
			filename: 'orca.gpx',
			contentType: 'application/gpx+xml',
			checksum: 'abc',
			data: new Blob(['gpx']),
			clientId: 'client-a',
			createdAt: 1_000,
			parserVersion: 1,
			extraction
		});

		await state.sync();
		const mutationCount = await db.count('mutations');
		const uploadCount = await db.count('pendingGpxUploads');
		db.close();
		await state.close();

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(mutationCount).toBe(1);
		expect(uploadCount).toBe(1);
		expect(state.status.phase).toBe('error');
	});
});
