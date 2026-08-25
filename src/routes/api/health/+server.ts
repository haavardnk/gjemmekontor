import { getDatabase } from '$lib/app/server/database';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export function _healthResponse(db: ReturnType<typeof getDatabase>, version?: string): Response {
	db.prepare('SELECT 1').get();
	return Response.json({ status: 'ok', ...(version ? { version } : {}) });
}

export const GET: RequestHandler = () => {
	const config = getRuntimeConfig();
	return _healthResponse(getDatabase(), config.appVersion);
};
