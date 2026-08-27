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
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function mutation(mutationId: string, key: string, value: string): Record<string, unknown> {
	return { mutationId, clientId: 'client-a', key, value, clientTimestamp: 1 };
}

async function sync(mutations: Record<string, unknown>[]): Promise<Response> {
	return handleSyncState(
		new Request('http://localhost/api/state/sync', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ mutations })
		}),
		db
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
		expect((await sync([mutation('m1', 'shared:key', 'first')])).status).toBe(200);
		expect((await sync([mutation('m2', 'shared:key', 'second')])).status).toBe(200);
		const duplicate = await sync([mutation('m1', 'shared:key', 'first')]);
		const pulled = handleGetState(new Request('http://localhost/api/state?since=0'), db);

		expect(await duplicate.json()).toEqual({ revision: 2, acknowledgedMutationIds: ['m1'] });
		expect(await pulled.json()).toMatchObject({
			revision: 2,
			entries: [{ key: 'shared:key', value: 'second', revision: 2 }]
		});
	});

	test('keeps different keys and accepts the last same-key mutation', async (): Promise<void> => {
		const response = await sync([
			mutation('m1', 'day:one', 'first'),
			mutation('m2', 'day:two', 'independent'),
			mutation('m3', 'day:one', 'last')
		]);
		const pulled = handleGetState(new Request('http://localhost/api/state?since=0'), db);

		expect(await response.json()).toEqual({
			revision: 3,
			acknowledgedMutationIds: ['m1', 'm2', 'm3']
		});
		expect(await pulled.json()).toMatchObject({
			revision: 3,
			entries: [
				{ key: 'day:two', value: 'independent', revision: 2 },
				{ key: 'day:one', value: 'last', revision: 3 }
			]
		});
	});
});
