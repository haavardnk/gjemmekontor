import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { openClientDatabase } from './database';
import { SharedState, type SharedStateUpload } from './state.svelte';

const databaseNames: string[] = [];

afterEach(async (): Promise<void> => {
	vi.unstubAllGlobals();
	for (const name of databaseNames.splice(0)) await deleteDB(name);
});

function databaseName(): string {
	const name = `gjemmekontor-state-test-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

function stateEntry(key: string, value: string, revision = 1) {
	return {
		key,
		value,
		revision,
		clientId: 'server-client',
		mutationId: `server-mutation-${revision}`,
		updatedAt: '2026-09-14T00:00:00.000Z'
	};
}

function upload(): SharedStateUpload {
	return {
		id: 'gpx-a',
		moduleId: 'logbook',
		relatedStateKey: 'logbook:d0:leg:a',
		path: '/api/logbook/gpx/gpx-a',
		query: { legKey: 'logbook:d0:leg:a', filename: 'route.gpx' },
		contentType: 'application/gpx+xml',
		data: new Blob(['gpx']),
		createdAt: 1,
		expectedResponse: { checksum: 'abc' }
	};
}

describe('shared state', (): void => {
	test('loads cached state before the network is available', async (): Promise<void> => {
		const name = databaseName();
		const database = await openClientDatabase(name);
		await database.put('state', stateEntry('rule-book:game', 'cached'));
		database.close();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(() => Promise.reject(new TypeError('offline')))
		});

		await state.initialize();

		expect(state.values['rule-book:game']).toBe('cached');
		expect(state.ready).toBe(true);
		await state.close();
	});

	test('replaces stale cached keys during a full pull', async (): Promise<void> => {
		const name = databaseName();
		const database = await openClientDatabase(name);
		await database.put('state', stateEntry('rule-book:stale', 'local'));
		database.close();
		const state = new SharedState({
			databaseName: name,
			fetcher: vi.fn(async (): Promise<Response> =>
				Response.json({ revision: 2, entries: [stateEntry('rule-book:current', 'server', 2)] })
			)
		});

		await state.sync();

		expect(state.values).toEqual({ 'rule-book:current': 'server' });
		const reopened = await openClientDatabase(name);
		expect(await reopened.get('state', 'rule-book:stale')).toBeUndefined();
		reopened.close();
		await state.close();
	});

	test('publishes a write only after acknowledgement and authoritative pull', async (): Promise<void> => {
		const push = Promise.withResolvers<Response>();
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			if (String(input).endsWith('/sync')) return push.promise;
			return Response.json({
				revision: 1,
				entries: [stateEntry('rule-book:game', 'server')]
			});
		});
		const state = new SharedState({
			databaseName: databaseName(),
			fetcher,
			randomId: (): string => 'mutation-a'
		});
		const writing = state.set('rule-book:game', 'requested');
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

		expect(state.values['rule-book:game']).toBeUndefined();
		expect(state.status).toEqual({ phase: 'saving', pending: 1 });
		push.resolve(Response.json({ revision: 1, acknowledgedMutationIds: ['mutation-a'] }));
		await writing;

		expect(state.values['rule-book:game']).toBe('server');
		expect(state.status).toEqual({ phase: 'synced', pending: 0 });
		await state.close();
	});

	test('does not let a failed write block a later authoritative pull', async (): Promise<void> => {
		let failWrite = true;
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			if (String(input).endsWith('/sync') && failWrite) {
				return Response.json({ error: 'FAILED' }, { status: 500 });
			}
			return Response.json({
				revision: 3,
				entries: [stateEntry('rule-book:game', 'latest', 3)]
			});
		});
		const state = new SharedState({ databaseName: databaseName(), fetcher });

		await expect(state.set('rule-book:game', 'lost')).rejects.toThrow('SYNC_PUSH_FAILED');
		expect(state.values['rule-book:game']).toBeUndefined();
		failWrite = false;
		await state.sync();

		expect(state.values['rule-book:game']).toBe('latest');
		expect(state.status).toEqual({ phase: 'synced', pending: 0 });
		await state.close();
	});

	test('serializes direct writes', async (): Promise<void> => {
		const pushedKeys: string[] = [];
		let revision = 0;
		const fetcher = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
				if (String(input).endsWith('/sync')) {
					const body = JSON.parse(String(init?.body)) as {
						mutations: Array<{ key: string; mutationId: string }>;
					};
					pushedKeys.push(...body.mutations.map((mutation) => mutation.key));
					revision += body.mutations.length;
					return Response.json({
						revision,
						acknowledgedMutationIds: body.mutations.map((mutation) => mutation.mutationId)
					});
				}
				return Response.json({ revision, entries: [] });
			}
		);
		const state = new SharedState({ databaseName: databaseName(), fetcher });

		await Promise.all([state.set('shots:first', true), state.set('shots:second', true)]);

		expect(pushedKeys).toEqual(['shots:first', 'shots:second']);
		await state.close();
	});

	test('rejects writes while offline without changing cached state', async (): Promise<void> => {
		vi.stubGlobal('navigator', { onLine: false });
		const fetcher = vi.fn();
		const state = new SharedState({ databaseName: databaseName(), fetcher });

		await expect(state.set('shots:offline', true)).rejects.toThrow('OFFLINE');

		expect(state.values['shots:offline']).toBeUndefined();
		expect(fetcher).not.toHaveBeenCalled();
		expect(state.status).toEqual({ phase: 'offline', pending: 0 });
		await state.close();
	});

	test('uploads and verifies GPX before writing its state', async (): Promise<void> => {
		const calls: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith('/api/logbook/gpx/gpx-a?')) {
				return Response.json({ id: 'gpx-a', checksum: 'abc', createdAt: '2026-09-14' });
			}
			if (url.endsWith('/sync')) {
				return Response.json({ revision: 1, acknowledgedMutationIds: ['mutation-a'] });
			}
			return Response.json({
				revision: 1,
				entries: [stateEntry('logbook:d0:leg:a', 'saved')]
			});
		});
		const state = new SharedState({
			databaseName: databaseName(),
			fetcher,
			randomId: (): string => 'mutation-a'
		});

		await state.setWithUpload('logbook:d0:leg:a', 'requested', upload());

		expect(calls[0]).toMatch(/^\/api\/logbook\/gpx\/gpx-a\?/);
		expect(calls[1]).toBe('/api/trips/test-trip/state/sync');
		expect(calls[2]).toBe('/api/trips/test-trip/state?since=0');
		expect(state.values['logbook:d0:leg:a']).toBe('saved');
		expect(state.isUploadPending('gpx-a')).toBe(false);
		await state.close();
	});

	test('does not write state when GPX upload fails', async (): Promise<void> => {
		const fetcher = vi.fn(async (): Promise<Response> =>
			Response.json({ error: 'GPX_INVALID' }, { status: 400 })
		);
		const state = new SharedState({ databaseName: databaseName(), fetcher });

		await expect(state.setWithUpload('logbook:d0:leg:a', 'requested', upload())).rejects.toThrow(
			'GPX_UPLOAD_FAILED'
		);

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(state.values['logbook:d0:leg:a']).toBeUndefined();
		expect(state.isUploadPending('gpx-a')).toBe(false);
		await state.close();
	});

	test('returns one persistent client ID', async (): Promise<void> => {
		const state = new SharedState({ databaseName: databaseName() });

		const first = await state.clientId();
		const second = await state.clientId();

		expect(second).toBe(first);
		expect(first).toMatch(/^[0-9a-f-]{36}$/);
		await state.close();
	});
});
