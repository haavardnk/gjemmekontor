import { handleSession } from '$lib/server/auth';
import { getDatabase } from '$lib/server/database';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) =>
	handleSession(cookies, { db: getDatabase(), config: getRuntimeConfig() });
