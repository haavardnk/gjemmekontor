import { handleLogout } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, locals }) =>
	handleLogout(cookies, { db: locals.db, config: getRuntimeConfig() });
