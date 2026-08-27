import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { verifySync } from '@node-rs/argon2';
import type { Cookies } from '@sveltejs/kit';
import type Database from 'better-sqlite3';

import { apiError, apiSuccess } from './api';
import type { RuntimeConfig } from './env';

export const sessionCookieName = 'gjemmekontor_session';
export const selectedTripCookieName = 'gjemmekontor_trip';
export const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
export const adminGrantDurationMs = 12 * 60 * 60 * 1000;
export const tripGrantDurationMs = sessionDurationMs;

const maxPasswordLength = 1024;
const attemptWindowMs = 15 * 60 * 1000;

export type AuthDependencies = {
	db: Database.Database;
	config: RuntimeConfig;
	now?: () => number;
};

type CookieReader = Pick<Cookies, 'get'>;
type CookieWriter = Pick<Cookies, 'set'>;
type CookieStore = CookieReader & CookieWriter;

function hashSecret(value: string, secret: string): Buffer {
	return createHmac('sha256', secret).update(value).digest();
}

function passwordIsValidInput(password: string): boolean {
	return password.length > 0 && password.length <= maxPasswordLength;
}

function adminPasswordFingerprint(config: RuntimeConfig): string {
	return hashSecret(`admin-password\0${config.adminPassword}`, config.sessionSecret).toString(
		'hex'
	);
}

function secureCookie(config: RuntimeConfig): boolean {
	return new URL(config.origin).protocol === 'https:';
}

function setSessionCookie(cookies: CookieWriter, token: string, config: RuntimeConfig): void {
	cookies.set(sessionCookieName, token, {
		path: '/',
		httpOnly: true,
		secure: secureCookie(config),
		sameSite: 'lax',
		maxAge: sessionDurationMs / 1000
	});
}

export function rememberTrip(cookies: CookieWriter, slug: string, config: RuntimeConfig): void {
	cookies.set(selectedTripCookieName, slug, {
		path: '/',
		httpOnly: true,
		secure: secureCookie(config),
		sameSite: 'lax',
		maxAge: sessionDurationMs / 1000
	});
}

export function createSession(db: Database.Database, secret: string, now: number): string {
	const token = randomBytes(32).toString('base64url');
	const idHash = hashSecret(token, secret).toString('hex');
	db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
	db.prepare('DELETE FROM auth_login_attempts WHERE last_failed_at < ?').run(now - attemptWindowMs);
	db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)').run(
		idHash,
		now + sessionDurationMs,
		now
	);
	return token;
}

export function validSessionHash(
	db: Database.Database,
	token: string | undefined,
	secret: string,
	now: number
): string | undefined {
	if (!token) return undefined;
	const idHash = hashSecret(token, secret).toString('hex');
	const session = db.prepare('SELECT expires_at FROM sessions WHERE id_hash = ?').get(idHash) as
		{ expires_at: number } | undefined;
	if (!session || session.expires_at <= now) {
		if (session) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
		return undefined;
	}
	return idHash;
}

function ensureSession(cookies: CookieStore, dependencies: AuthDependencies, now: number): string {
	const currentToken = cookies.get(sessionCookieName);
	const currentHash = validSessionHash(
		dependencies.db,
		currentToken,
		dependencies.config.sessionSecret,
		now
	);
	if (currentHash) return currentHash;

	const token = createSession(dependencies.db, dependencies.config.sessionSecret, now);
	setSessionCookie(cookies, token, dependencies.config);
	return hashSecret(token, dependencies.config.sessionSecret).toString('hex');
}

function attemptScope(
	kind: 'admin' | 'trip',
	subject: string,
	clientKey: string,
	secret: string
): string {
	return hashSecret(`${kind}\0${subject}\0${clientKey}`, secret).toString('hex');
}

function isAttemptBlocked(db: Database.Database, scopeKey: string, now: number): boolean {
	const row = db
		.prepare('SELECT blocked_until FROM auth_login_attempts WHERE scope_key = ?')
		.get(scopeKey) as { blocked_until: number } | undefined;
	return Boolean(row && row.blocked_until > now);
}

function recordFailedAttempt(db: Database.Database, scopeKey: string, now: number): void {
	const row = db
		.prepare('SELECT failure_count, last_failed_at FROM auth_login_attempts WHERE scope_key = ?')
		.get(scopeKey) as { failure_count: number; last_failed_at: number } | undefined;
	const failureCount =
		row && row.last_failed_at >= now - attemptWindowMs ? row.failure_count + 1 : 1;
	const blockMs = failureCount < 5 ? 0 : Math.min(15 * 60 * 1000, 30_000 * 2 ** (failureCount - 5));
	db.prepare(
		`INSERT INTO auth_login_attempts
		 (scope_key, failure_count, blocked_until, last_failed_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(scope_key) DO UPDATE SET
		 failure_count = excluded.failure_count,
		 blocked_until = excluded.blocked_until,
		 last_failed_at = excluded.last_failed_at`
	).run(scopeKey, failureCount, now + blockMs, now);
}

function clearAttempts(db: Database.Database, scopeKey: string): void {
	db.prepare('DELETE FROM auth_login_attempts WHERE scope_key = ?').run(scopeKey);
}

export function authenticateAdmin(
	password: string,
	clientKey: string,
	cookies: CookieStore,
	dependencies: AuthDependencies
): 'authenticated' | 'invalid' | 'rate_limited' {
	const now = dependencies.now?.() ?? Date.now();
	const scopeKey = attemptScope('admin', 'global', clientKey, dependencies.config.sessionSecret);
	if (isAttemptBlocked(dependencies.db, scopeKey, now)) return 'rate_limited';

	const supplied = hashSecret(password, dependencies.config.sessionSecret);
	const expected = hashSecret(dependencies.config.adminPassword, dependencies.config.sessionSecret);
	if (!passwordIsValidInput(password) || !timingSafeEqual(supplied, expected)) {
		recordFailedAttempt(dependencies.db, scopeKey, now);
		return 'invalid';
	}

	clearAttempts(dependencies.db, scopeKey);
	const sessionHash = ensureSession(cookies, dependencies, now);
	dependencies.db
		.prepare(
			`INSERT INTO session_admin_grants
			 (session_id_hash, password_fingerprint, granted_at, expires_at, last_used_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(session_id_hash) DO UPDATE SET
			 password_fingerprint = excluded.password_fingerprint,
			 granted_at = excluded.granted_at,
			 expires_at = excluded.expires_at,
			 last_used_at = excluded.last_used_at`
		)
		.run(
			sessionHash,
			adminPasswordFingerprint(dependencies.config),
			now,
			now + adminGrantDurationMs,
			now
		);
	return 'authenticated';
}

export function authenticateTrip(
	tripId: string,
	password: string,
	clientKey: string,
	cookies: CookieStore,
	dependencies: AuthDependencies
): 'authenticated' | 'invalid' | 'rate_limited' | 'setup_required' {
	const now = dependencies.now?.() ?? Date.now();
	const credential = dependencies.db
		.prepare(
			`SELECT c.password_hash, c.credential_version, t.status
			 FROM trips t LEFT JOIN trip_credentials c ON c.trip_id = t.id
			 WHERE t.id = ? AND t.status != 'archived'`
		)
		.get(tripId) as
		{ password_hash: string | null; credential_version: number | null; status: string } | undefined;
	if (!credential || credential.status === 'draft' || !credential.password_hash) {
		return 'setup_required';
	}

	const scopeKey = attemptScope('trip', tripId, clientKey, dependencies.config.sessionSecret);
	if (isAttemptBlocked(dependencies.db, scopeKey, now)) return 'rate_limited';
	let valid = false;
	if (passwordIsValidInput(password)) {
		try {
			valid = verifySync(credential.password_hash, password);
		} catch {
			valid = false;
		}
	}
	if (!valid || credential.credential_version === null) {
		recordFailedAttempt(dependencies.db, scopeKey, now);
		return 'invalid';
	}

	clearAttempts(dependencies.db, scopeKey);
	const sessionHash = ensureSession(cookies, dependencies, now);
	dependencies.db
		.prepare(
			`INSERT INTO session_trip_grants
			 (session_id_hash, trip_id, credential_version, granted_at, expires_at, last_used_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(session_id_hash, trip_id) DO UPDATE SET
			 credential_version = excluded.credential_version,
			 granted_at = excluded.granted_at,
			 expires_at = excluded.expires_at,
			 last_used_at = excluded.last_used_at`
		)
		.run(sessionHash, tripId, credential.credential_version, now, now + tripGrantDurationMs, now);
	return 'authenticated';
}

export function isAdminAuthorized(
	db: Database.Database,
	token: string | undefined,
	config: RuntimeConfig,
	now: number
): boolean {
	const sessionHash = validSessionHash(db, token, config.sessionSecret, now);
	if (!sessionHash) return false;
	const grant = db
		.prepare(
			`SELECT password_fingerprint, expires_at
			 FROM session_admin_grants WHERE session_id_hash = ?`
		)
		.get(sessionHash) as { password_fingerprint: string; expires_at: number } | undefined;
	if (
		!grant ||
		grant.expires_at <= now ||
		grant.password_fingerprint !== adminPasswordFingerprint(config)
	) {
		if (grant)
			db.prepare('DELETE FROM session_admin_grants WHERE session_id_hash = ?').run(sessionHash);
		return false;
	}
	db.prepare('UPDATE session_admin_grants SET last_used_at = ? WHERE session_id_hash = ?').run(
		now,
		sessionHash
	);
	return true;
}

export function isTripAuthorized(
	db: Database.Database,
	token: string | undefined,
	tripId: string,
	secret: string,
	now: number
): boolean {
	const sessionHash = validSessionHash(db, token, secret, now);
	if (!sessionHash) return false;
	const grant = db
		.prepare(
			`SELECT g.expires_at, g.credential_version AS granted_version,
			        c.credential_version AS current_version, t.status
			 FROM session_trip_grants g
			 JOIN trips t ON t.id = g.trip_id
			 LEFT JOIN trip_credentials c ON c.trip_id = g.trip_id
			 WHERE g.session_id_hash = ? AND g.trip_id = ?`
		)
		.get(sessionHash, tripId) as
		| {
				expires_at: number;
				granted_version: number;
				current_version: number | null;
				status: string;
		  }
		| undefined;
	if (
		!grant ||
		grant.expires_at <= now ||
		grant.status === 'draft' ||
		grant.status === 'archived' ||
		grant.current_version !== grant.granted_version
	) {
		if (grant) {
			db.prepare('DELETE FROM session_trip_grants WHERE session_id_hash = ? AND trip_id = ?').run(
				sessionHash,
				tripId
			);
		}
		return false;
	}
	db.prepare(
		'UPDATE session_trip_grants SET last_used_at = ? WHERE session_id_hash = ? AND trip_id = ?'
	).run(now, sessionHash, tripId);
	return true;
}

export function deleteSession(db: Database.Database, token: string, secret: string): void {
	const idHash = hashSecret(token, secret).toString('hex');
	db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
}

export function handleLogout(cookies: CookieStore, dependencies: AuthDependencies): Response {
	const token = cookies.get(sessionCookieName);
	if (token) deleteSession(dependencies.db, token, dependencies.config.sessionSecret);
	for (const name of [sessionCookieName, selectedTripCookieName]) {
		cookies.set(name, '', {
			path: '/',
			httpOnly: true,
			secure: secureCookie(dependencies.config),
			sameSite: 'lax',
			maxAge: 0
		});
	}
	return apiSuccess({ authenticated: false });
}

export function handleSession(
	cookies: CookieReader,
	dependencies: AuthDependencies,
	tripId?: string
): Response {
	const token = cookies.get(sessionCookieName);
	const now = dependencies.now?.() ?? Date.now();
	const admin = isAdminAuthorized(dependencies.db, token, dependencies.config, now);
	const trip = tripId
		? isTripAuthorized(dependencies.db, token, tripId, dependencies.config.sessionSecret, now)
		: false;
	if (!admin && !trip) return apiError('UNAUTHENTICATED', 401);
	return apiSuccess({ authenticated: true, admin, trip });
}
