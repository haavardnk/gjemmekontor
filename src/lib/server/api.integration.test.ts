import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Cookies } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import { authenticateAdmin, sessionCookieName } from './auth';
import type { RuntimeConfig } from './env';
import { handleGetState, handleSyncState } from './state';

const config: RuntimeConfig = {
	adminPassword: 'correct-administrator-password',
	sessionSecret: '0123456789abcdef0123456789abcdef',
	dataDir: '',
	origin: 'https://gjemmekontor.example.com'
};

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-api-'));
	db = createApplicationDatabase(dataDir);
	const insertTrip = db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, ?, ?, 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	);
	insertTrip.run('trip-a', 'trip-a', 'Trip A', '2026-08-27', '2026-08-27');
	insertTrip.run('trip-b', 'trip-b', 'Trip B', '2026-08-27', '2026-08-27');
	db.prepare('INSERT INTO trip_revisions (trip_id, revision) VALUES (?, 0)').run('trip-a');
	db.prepare('INSERT INTO trip_revisions (trip_id, revision) VALUES (?, 0)').run('trip-b');
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function mutation(mutationId: string, key: string, value: string): Record<string, unknown> {
	return { mutationId, clientId: 'client-a', key, value, clientTimestamp: 1 };
}

async function sync(mutations: Record<string, unknown>[], tripId = 'trip-a'): Promise<Response> {
	return handleSyncState(
		new Request(`http://localhost/api/trips/${tripId}/state/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ mutations })
		}),
		db,
		tripId,
		['shots']
	);
}

describe('API integration', (): void => {
	test('reports healthy status', async (): Promise<void> => {
		const response = await import('../../routes/api/health/+server').then(({ _healthResponse }) =>
			_healthResponse(db)
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	test('reports the tag-derived release version', async (): Promise<void> => {
		const response = await import('../../routes/api/health/+server').then(({ _healthResponse }) =>
			_healthResponse(db, '0.1.0')
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok', version: '0.1.0' });
	});

	test('rejects an invalid admin password without creating a session', (): void => {
		const cookies: Pick<Cookies, 'get' | 'set'> = {
			get: (): undefined => undefined,
			set: (): void => undefined
		};
		const result = authenticateAdmin('wrong-password', 'client-a', cookies, {
			db,
			config,
			now: (): number => 1_000
		});
		const count = db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number };

		expect(result).toBe('invalid');
		expect(count.count).toBe(0);
	});

	test('creates a hashed admin session and secure cookie', (): void => {
		const written: { name?: string; value?: string; options?: Parameters<Cookies['set']>[2] } = {};
		const cookies: Pick<Cookies, 'get' | 'set'> = {
			get: (): undefined => undefined,
			set: (name, value, options): void => {
				written.name = name;
				written.value = value;
				written.options = options;
			}
		};
		const result = authenticateAdmin(config.adminPassword, 'client-a', cookies, {
			db,
			config,
			now: (): number => 1_000
		});
		const session = db.prepare('SELECT id_hash FROM sessions').get() as { id_hash: string };
		const grant = db.prepare('SELECT session_id_hash FROM session_admin_grants').get();

		expect(result).toBe('authenticated');
		expect(written.name).toBe(sessionCookieName);
		expect(written.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
		expect(session.id_hash).not.toBe(written.value);
		expect(grant).toEqual({ session_id_hash: session.id_hash });
	});

	test('deduplicates mutations after a newer same-key write', async (): Promise<void> => {
		expect((await sync([mutation('m1', 'shots:shared:key', 'first')])).status).toBe(200);
		expect((await sync([mutation('m2', 'shots:shared:key', 'second')])).status).toBe(200);
		const duplicate = await sync([mutation('m1', 'shots:shared:key', 'first')]);
		const pulled = handleGetState(
			new Request('http://localhost/api/trips/trip-a/state?since=0'),
			db,
			'trip-a'
		);

		expect(await duplicate.json()).toEqual({ revision: 2, acknowledgedMutationIds: ['m1'] });
		expect(await pulled.json()).toMatchObject({
			revision: 2,
			entries: [{ key: 'shots:shared:key', value: 'second', revision: 2 }]
		});
	});

	test('keeps different keys and accepts the last same-key mutation', async (): Promise<void> => {
		const response = await sync([
			mutation('m1', 'shots:day:one', 'first'),
			mutation('m2', 'shots:day:two', 'independent'),
			mutation('m3', 'shots:day:one', 'last')
		]);
		const pulled = handleGetState(
			new Request('http://localhost/api/trips/trip-a/state?since=0'),
			db,
			'trip-a'
		);

		expect(await response.json()).toEqual({
			revision: 3,
			acknowledgedMutationIds: ['m1', 'm2', 'm3']
		});
		expect(await pulled.json()).toMatchObject({
			revision: 3,
			entries: [
				{ key: 'shots:day:two', value: 'independent', revision: 2 },
				{ key: 'shots:day:one', value: 'last', revision: 3 }
			]
		});
	});

	test('isolates state revisions, keys, and mutation receipts by trip', async (): Promise<void> => {
		expect((await sync([mutation('same-mutation', 'shots:d0:test', 'first')])).status).toBe(200);
		expect(
			(await sync([mutation('same-mutation', 'shots:d0:test', 'second')], 'trip-b')).status
		).toBe(200);
		const first = handleGetState(
			new Request('http://localhost/api/trips/trip-a/state?since=0'),
			db,
			'trip-a'
		);
		const second = handleGetState(
			new Request('http://localhost/api/trips/trip-b/state?since=0'),
			db,
			'trip-b'
		);

		expect(await first.json()).toMatchObject({
			revision: 1,
			entries: [{ key: 'shots:d0:test', value: 'first' }]
		});
		expect(await second.json()).toMatchObject({
			revision: 1,
			entries: [{ key: 'shots:d0:test', value: 'second' }]
		});
		expect(
			(
				db
					.prepare('SELECT COUNT(*) AS count FROM trip_mutation_receipts WHERE mutation_id = ?')
					.get('same-mutation') as { count: number }
			).count
		).toBe(2);
	});

	test('rejects state writes for disabled modules', async (): Promise<void> => {
		const response = await handleSyncState(
			new Request('http://localhost/api/trips/trip-a/state/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					mutations: [mutation('disabled', 'rule-book:rule:0', 'changed')]
				})
			}),
			db,
			'trip-a',
			['shots']
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' });
		expect(
			(
				db.prepare('SELECT revision FROM trip_revisions WHERE trip_id = ?').get('trip-a') as {
					revision: number;
				}
			).revision
		).toBe(0);
	});
});
