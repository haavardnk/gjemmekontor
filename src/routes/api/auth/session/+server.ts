import { getDatabase } from '$lib/app/server/database';
import { getTripBySlug } from '$lib/app/server/trips';
import { handleSession, selectedTripCookieName } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) => {
	const db = getDatabase();
	const slug = cookies.get(selectedTripCookieName);
	const trip = slug ? getTripBySlug(db, slug) : undefined;
	return handleSession(cookies, { db, config: getRuntimeConfig() }, trip?.id);
};
