import { handleLogin } from '$lib/server/auth';
import { getDatabase } from '$lib/server/database';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, cookies }) =>
	handleLogin(request, cookies, { db: getDatabase(), config: getRuntimeConfig() });
