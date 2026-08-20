import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Cookies } from '@sveltejs/kit';
import type Database from 'better-sqlite3';
import { z } from 'zod';

import { apiError, apiSuccess } from './api';
import type { RuntimeConfig } from './env';

export const sessionCookieName = 'gjemmekontor_session';
export const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;

const loginSchema = z.object({ password: z.string().min(1).max(1024) }).strict();

type AuthDependencies = {
	db: Database.Database;
	config: RuntimeConfig;
	now?: () => number;
};

type CookieReader = Pick<Cookies, 'get'>;
type CookieWriter = Pick<Cookies, 'set'>;

function hashSecret(value: string, secret: string): Buffer {
	return createHmac('sha256', secret).update(value).digest();
}

export function verifyPassword(password: string, config: RuntimeConfig): boolean {
	const expected = hashSecret(config.appPassword, config.sessionSecret);
	const supplied = hashSecret(password, config.sessionSecret);
	return timingSafeEqual(expected, supplied);
}

export function createSession(db: Database.Database, secret: string, now: number): string {
	const token = randomBytes(32).toString('base64url');
	const idHash = hashSecret(token, secret).toString('hex');
	db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
	db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)').run(
		idHash,
		now + sessionDurationMs,
		now
	);
	return token;
}

export function createAuthenticatedSession(
	password: string,
	cookies: CookieWriter,
	dependencies: AuthDependencies
): boolean {
	if (!loginSchema.shape.password.safeParse(password).success) {
		return false;
	}
	if (!verifyPassword(password, dependencies.config)) {
		return false;
	}

	const now = dependencies.now?.() ?? Date.now();
	const token = createSession(dependencies.db, dependencies.config.sessionSecret, now);
	cookies.set(sessionCookieName, token, {
		path: '/',
		httpOnly: true,
		secure: new URL(dependencies.config.origin).protocol === 'https:',
		sameSite: 'lax',
		maxAge: sessionDurationMs / 1000
	});
	return true;
}

export function deleteSession(db: Database.Database, token: string, secret: string): void {
	const idHash = hashSecret(token, secret).toString('hex');
	db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
}

export function isSessionValid(
	db: Database.Database,
	token: string | undefined,
	secret: string,
	now: number
): boolean {
	if (!token) {
		return false;
	}

	const idHash = hashSecret(token, secret).toString('hex');
	const session = db.prepare('SELECT expires_at FROM sessions WHERE id_hash = ?').get(idHash) as
		{ expires_at: number } | undefined;
	if (!session || session.expires_at <= now) {
		if (session) {
			db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
		}
		return false;
	}

	return true;
}

export async function handleLogin(
	request: Request,
	cookies: CookieWriter,
	dependencies: AuthDependencies
): Promise<Response> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return apiError('INVALID_REQUEST', 400);
	}

	const result = loginSchema.safeParse(body);
	if (!result.success) {
		return apiError('INVALID_REQUEST', 400);
	}
	if (!createAuthenticatedSession(result.data.password, cookies, dependencies)) {
		return apiError('INVALID_CREDENTIALS', 401);
	}
	return apiSuccess({ authenticated: true });
}

export function handleLogout(
	cookies: CookieReader & CookieWriter,
	dependencies: AuthDependencies
): Response {
	const token = cookies.get(sessionCookieName);
	if (token) {
		deleteSession(dependencies.db, token, dependencies.config.sessionSecret);
	}
	cookies.set(sessionCookieName, '', {
		path: '/',
		httpOnly: true,
		secure: new URL(dependencies.config.origin).protocol === 'https:',
		sameSite: 'lax',
		maxAge: 0
	});
	return apiSuccess({ authenticated: false });
}

export function handleSession(cookies: CookieReader, dependencies: AuthDependencies): Response {
	const valid = isSessionValid(
		dependencies.db,
		cookies.get(sessionCookieName),
		dependencies.config.sessionSecret,
		dependencies.now?.() ?? Date.now()
	);
	if (!valid) {
		return apiError('UNAUTHENTICATED', 401);
	}

	return apiSuccess({ authenticated: true });
}
