import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { openClientDatabase, type PendingUpload, tripClientDatabaseName } from './database';
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

function pendingUpload(
	id: string,
	relatedStateKey: string,
	filename: string,
	data = 'gpx',
	createdAt = 1_000
): PendingUpload {
	return {
		id,
		moduleId: 'logbook',
		relatedStateKey,
		path: `/api/logbook/gpx/${id}`,
		query: { legKey: relatedStateKey, filename },
		contentType: 'application/gpx+xml',
		data: new Blob([data]),
		clientId: 'client-a',
		createdAt,
		expectedResponse: { checksum: 'abc', parserVersion: 1, extraction }
	};
}

describe('client state', (): void => {
	test('creates all typed stores', async (): Promise<void> => {
		const db = await openClientDatabase(databaseName());

		expect(Array.from(db.objectStoreNames)).toEqual([
			'meta',
			'moduleBlobs',
			'moduleData',
			'mutations',
			'pendingUploads',
			'state'
		]);
		db.close();
	});

	test('starts each trip in a clean database without importing legacy device data', async (): Promise<void> => {
		const legacyName = databaseName();
		const legacy = await openDB(legacyName, 1, {
			upgrade(database): void {
				database.createObjectStore('state', { keyPath: 'key' });
				database.createObjectStore('mutations', { keyPath: 'mutationId' });
				database.createObjectStore('meta', { keyPath: 'key' });
				database.createObjectStore('mapSnapshot', { keyPath: 'id' });
				database.createObjectStore('offlineMap', { keyPath: 'id' });
				database.createObjectStore('shoppingListSnapshot', { keyPath: 'id' });
				database.createObjectStore('pendingGpxUploads', { keyPath: 'id' });
			}
		});
		await legacy.put('state', {
			key: 'shots:d0:scenario:test',
			value: true,
			revision: 0,
			clientId: 'client-a',
			mutationId: 'mutation-a',
			updatedAt: '2026-08-25T00:00:00.000Z'
		});
		await legacy.put('meta', { key: 'selectedDay', value: { dayIndex: 2 } });
		await legacy.put('mapSnapshot', { id: 'current', value: { stale: true } });
		legacy.close();

		const tripName = tripClientDatabaseName(crypto.randomUUID());
		databaseNames.push(tripName);
		const database = await openClientDatabase(tripName);
		expect(database.version).toBe(1);
		expect(await database.count('state')).toBe(0);
		expect(await database.get('meta', 'selectedDay')).toBeUndefined();
		expect(await database.count('moduleData')).toBe(0);
		database.close();
	});

	test('isolates browser state and metadata between trips', async (): Promise<void> => {
		const firstName = tripClientDatabaseName('trip-a');
		const secondName = tripClientDatabaseName('trip-b');
		databaseNames.push(firstName, secondName);
		const first = await openClientDatabase(firstName);
		const second = await openClientDatabase(secondName);
		await first.put('state', {
			key: 'shots:d0:test',
			value: 'first',
			revision: 1,
			clientId: 'client-a',
			mutationId: 'mutation-a',
			updatedAt: '2026-08-27T00:00:00.000Z'
		});
		await first.put('meta', { key: 'selectedDay', value: { dayIndex: 4 } });

		expect(await second.get('state', 'shots:d0:test')).toBeUndefined();
		expect(await second.get('meta', 'selectedDay')).toBeUndefined();
		first.close();
		second.close();
	});

	test('clears in-memory state when the active trip changes', async (): Promise<void> => {
		const firstName = tripClientDatabaseName('trip-a');
		const secondName = tripClientDatabaseName('trip-b');
		databaseNames.push(firstName, secondName);
		const first = await openClientDatabase(firstName);
		await first.put('state', {
			key: 'shots:d0:test',
			value: 'only-first-trip',
			revision: 1,
			clientId: 'client-a',
			mutationId: 'mutation-a',
			updatedAt: '2026-08-27T00:00:00.000Z'
		});
		first.close();
		const state = new SharedState({
			fetcher: vi.fn(async (): Promise<Response> => Response.json({ revision: 0, entries: [] }))
		});

		await state.start('trip-a');
		expect(state.values['shots:d0:test']).toBe('only-first-trip');
		await state.start('trip-b');

		expect(state.values['shots:d0:test']).toBeUndefined();
		expect(state.values).toEqual({});
		await state.close();
	});

	test('persists a leg mutation and GPX blob atomically', async (): Promise<void> => {
		const name = databaseName();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => new Promise<Response>(() => undefined)),
			now: (): number => 1_000,
			randomId: (): string => 'mutation-gpx'
		});

		await state.setWithUpload(
			'logbook:d0:leg:leg-a',
			{ gpxId: 'gpx-a' },
			pendingUpload('gpx-a', 'logbook:d0:leg:leg-a', 'orca.gpx')
		);
		const db = await openClientDatabase(name);
		const saved = await db.get('state', 'logbook:d0:leg:leg-a');
		const mutation = await db.get('mutations', 'mutation-gpx');
		const upload = await db.get('pendingUploads', 'gpx-a');
		db.close();
		await state.close();

		expect(saved?.value).toEqual({ gpxId: 'gpx-a' });
		expect(mutation?.key).toBe('logbook:d0:leg:leg-a');
		expect(mutation?.sequence).toBe(1);
		expect(await upload?.data.text()).toBe('gpx');
		expect(state.isUploadPending('gpx-a')).toBe(true);
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

	test('persists several state writes and consecutive mutations atomically', async (): Promise<void> => {
		const name = databaseName();
		let id = 0;
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => new Promise<Response>(() => undefined)),
			now: (): number => 1_000,
			randomId: (): string => `mutation-${++id}`
		});

		await state.setMany([
			{ key: 'menu:archive:a', value: { name: 'Taco' } },
			{ key: 'menu:active:a', value: { categories: ['dinner'] } }
		]);
		const db = await openClientDatabase(name);
		const mutations = await db.getAll('mutations');
		const sequence = await db.get('meta', 'mutationSequence');
		db.close();
		await state.close();

		expect(mutations.map((mutation) => mutation.sequence).sort()).toEqual([1, 2]);
		expect(sequence?.value).toBe(2);
		expect(state.values['menu:archive:a']).toEqual({ name: 'Taco' });
		expect(state.values['menu:active:a']).toEqual({ categories: ['dinner'] });
	});

	test('rejects duplicate keys before opening a transaction', async (): Promise<void> => {
		const state = new SharedState({ databaseName: databaseName() });

		await expect(
			state.setMany([
				{ key: 'same', value: 1 },
				{ key: 'same', value: 2 }
			])
		).rejects.toThrow('INVALID_STATE_WRITES');
		await state.close();
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
			if (url === '/api/trips/test-trip/state/sync') {
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
			key: 'shots:local:key',
			value: 'local',
			clientTimestamp: 1_000
		});

		await state.sync();
		const mutationCount = await db.count('mutations');
		db.close();
		await state.close();

		expect(calls).toEqual([
			'/api/trips/test-trip/state/sync',
			'/api/trips/test-trip/state?since=0'
		]);
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
			if (url === '/api/trips/test-trip/state/sync') {
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
		await db.put('pendingUploads', pendingUpload('gpx-a', 'logbook:d0:leg:leg-a', 'orca.gpx'));

		await state.sync();
		const uploadCount = await db.count('pendingUploads');
		db.close();
		await state.close();

		expect(calls[0]).toMatch(/^\/api\/logbook\/gpx\/gpx-a\?/);
		expect(calls[1]).toBe('/api/trips/test-trip/state/sync');
		expect(calls[2]).toBe('/api/trips/test-trip/state?since=0');
		expect(uploadCount).toBe(0);
		expect(state.isUploadPending('gpx-a')).toBe(false);
	});

	test('does not initialize a disabled module pending-upload provider', async (): Promise<void> => {
		const name = databaseName();
		const calls: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			calls.push(String(input));
			return Response.json({ revision: 0, entries: [] });
		});
		const database = await openClientDatabase(name);
		await database.put('mutations', {
			mutationId: 'mutation-gpx',
			clientId: 'client-a',
			key: 'logbook:d0:leg:leg-a',
			value: { gpxId: 'gpx-a' },
			clientTimestamp: 1_000,
			sequence: 1
		});
		await database.put(
			'pendingUploads',
			pendingUpload('gpx-a', 'logbook:d0:leg:leg-a', 'orca.gpx')
		);
		database.close();
		const state = new SharedState({ databaseName: name, fetcher });

		await state.start('test-trip', ['shots']);
		const reopened = await openClientDatabase(name);
		expect(calls).toEqual(['/api/trips/test-trip/state?since=0']);
		expect(await reopened.count('pendingUploads')).toBe(1);
		expect(await reopened.count('mutations')).toBe(1);
		reopened.close();
		await state.close();
	});

	test('replays pending mutations in durable sequence order', async (): Promise<void> => {
		const name = databaseName();
		let pushed: { mutationId: string; sequence?: number }[] = [];
		const fetcher = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
				if (String(input) === '/api/trips/test-trip/state/sync') {
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
					await state.setWithUpload(
						'logbook:d0:leg:leg-b',
						{ gpxId: 'gpx-b' },
						pendingUpload('gpx-b', 'logbook:d0:leg:leg-b', 'b.gpx', 'b', 2_000)
					);
				}
				if (url.startsWith('/api/logbook/gpx/')) {
					return Response.json({ checksum: 'abc', parserVersion: 1, extraction });
				}
				if (url === '/api/trips/test-trip/state/sync') {
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
		await db.put('pendingUploads', pendingUpload('gpx-a', 'logbook:d0:leg:leg-a', 'a.gpx', 'a'));

		await state.sync();
		const mutationCount = await db.count('mutations');
		const uploadCount = await db.count('pendingUploads');
		db.close();
		await state.close();

		expect(calls.findIndex((call) => call.startsWith('/api/logbook/gpx/gpx-a?'))).toBeLessThan(
			calls.findIndex((call) => call === '/api/trips/test-trip/state/sync')
		);
		expect(calls.findIndex((call) => call.startsWith('/api/logbook/gpx/gpx-b?'))).toBeLessThan(
			calls.lastIndexOf('/api/trips/test-trip/state/sync')
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
		await db.put('pendingUploads', pendingUpload('gpx-a', 'logbook:d0:leg:leg-a', 'orca.gpx'));

		await state.sync();
		const mutationCount = await db.count('mutations');
		const uploadCount = await db.count('pendingUploads');
		db.close();
		await state.close();

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(mutationCount).toBe(1);
		expect(uploadCount).toBe(1);
		expect(state.status.phase).toBe('error');
	});
});
