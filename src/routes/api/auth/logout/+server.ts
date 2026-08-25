import { getDatabase } from '$lib/app/server/database';
import { handleLogout } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) =>
	handleLogout(cookies, { db: getDatabase(), config: getRuntimeConfig() });
