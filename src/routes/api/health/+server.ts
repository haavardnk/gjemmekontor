import type Database from 'better-sqlite3';

import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export function _healthResponse(db: Database.Database, version?: string): Response {
	db.prepare('SELECT 1').get();
	return Response.json({ status: 'ok', ...(version ? { version } : {}) });
}

export const GET: RequestHandler = ({ locals }) => {
	const config = getRuntimeConfig();
	return _healthResponse(locals.db, config.appVersion);
};
