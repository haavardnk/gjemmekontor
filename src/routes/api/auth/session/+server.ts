import { getDatabase } from '$lib/app/server/database';
import { handleSession } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) =>
	handleSession(cookies, { db: getDatabase(), config: getRuntimeConfig() });
