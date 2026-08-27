import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hashSync } from '@node-rs/argon2';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import {
	authenticateAdmin,
	authenticateTrip,
	isAdminAuthorized,
	isTripAuthorized,
	sessionCookieName
} from './auth';
import type { RuntimeConfig } from './env';

const config: RuntimeConfig = {
	adminPassword: 'correct-administrator-password',
	sessionSecret: '0123456789abcdef0123456789abcdef',
	dataDir: '',
	origin: 'https://gjemmekontor.example.com'
};

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-auth-'));
	db = createApplicationDatabase(dataDir);
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function cookieStore() {
	const values = new Map<string, string>();
	return {
		get: (name: string): string | undefined => values.get(name),
		set: (name: string, value: string): void => {
			values.set(name, value);
		}
	};
}

function seedTrip(status: 'draft' | 'active' = 'active'): string {
	const tripId = '1f072b1a-a530-4786-a2a1-9b68567b26bf';
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, destination, starts_on, ends_on, timezone, locale,
		  status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, 'test-trip', 'Testtur', '', NULL, NULL, 'Europe/Oslo', 'nb-NO',
		         ?, 'listed', 'Velkommen', '2026-08-27', '2026-08-27')`
	).run(tripId, status);
	if (status === 'active') {
		db.prepare(
			`INSERT INTO trip_credentials
			 (trip_id, password_hash, credential_version, updated_at) VALUES (?, ?, 1, ?)`
		).run(tripId, hashSync('correct-trip-password'), '2026-08-27');
	}
	return tripId;
}

describe('administrator and trip grants', (): void => {
	test('invalidates an admin grant when the environment password changes', (): void => {
		const cookies = cookieStore();
		expect(authenticateAdmin(config.adminPassword, 'client-a', cookies, { db, config })).toBe(
			'authenticated'
		);
		expect(isAdminAuthorized(db, cookies.get(sessionCookieName), config, Date.now())).toBe(true);
		expect(
			isAdminAuthorized(
				db,
				cookies.get(sessionCookieName),
				{ ...config, adminPassword: 'different-administrator-password' },
				Date.now()
			)
		).toBe(false);
	});

	test('does not permit trip login while administrator setup is required', (): void => {
		const tripId = seedTrip('draft');
		expect(authenticateTrip(tripId, 'anything', 'client-a', cookieStore(), { db, config })).toBe(
			'setup_required'
		);
		expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 0 });
	});

	test('ties a trip grant to its credential version', (): void => {
		const tripId = seedTrip();
		const cookies = cookieStore();
		expect(
			authenticateTrip(tripId, 'correct-trip-password', 'client-a', cookies, { db, config })
		).toBe('authenticated');
		expect(
			isTripAuthorized(db, cookies.get(sessionCookieName), tripId, config.sessionSecret, Date.now())
		).toBe(true);
		db.prepare('UPDATE trip_credentials SET credential_version = 2 WHERE trip_id = ?').run(tripId);
		expect(
			isTripAuthorized(db, cookies.get(sessionCookieName), tripId, config.sessionSecret, Date.now())
		).toBe(false);
	});

	test('rate limits repeated administrator failures', (): void => {
		const cookies = cookieStore();
		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(authenticateAdmin('wrong-password', 'client-a', cookies, { db, config })).toBe(
				'invalid'
			);
		}
		expect(authenticateAdmin(config.adminPassword, 'client-a', cookies, { db, config })).toBe(
			'rate_limited'
		);
	});
});
