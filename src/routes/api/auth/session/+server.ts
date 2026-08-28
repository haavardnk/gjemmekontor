import { getTripBySlug } from '$lib/app/server/trips';
import { handleSession, selectedTripCookieName } from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, locals }) => {
	const slug = cookies.get(selectedTripCookieName);
	const trip = slug ? getTripBySlug(locals.db, slug) : undefined;
	return handleSession(cookies, { db: locals.db, config: getRuntimeConfig() }, trip?.id);
};
