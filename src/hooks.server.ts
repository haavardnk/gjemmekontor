import type { Handle } from '@sveltejs/kit';

import { apiError } from '$lib/server/api';
import { isSessionValid, sessionCookieName } from '$lib/server/auth';
import { getDatabase } from '$lib/server/database';
import { getRuntimeConfig } from '$lib/server/env';

const publicPaths = new Set(['/login', '/api/auth/login', '/api/health']);

function isPublicPath(pathname: string): boolean {
	return (
		publicPaths.has(pathname) ||
		pathname.startsWith('/_app/') ||
		pathname === '/service-worker.js' ||
		/\.[a-z0-9]+$/i.test(pathname)
	);
}

function applySecurityHeaders(response: Response, pathname: string): void {
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	if (
		/^\/api\/(auth|state|map|logbook\/gpx)(\/|$)/.test(pathname) &&
		!/^\/api\/map\/(offline\/(normal|nautical|satellite)|(depth-contours|marine-profile)\/\d+\/\d+\/\d+|harbours)$/.test(
			pathname
		)
	) {
		response.headers.set('Cache-Control', 'no-store');
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const config = getRuntimeConfig();
	const authenticated = isSessionValid(
		getDatabase(),
		event.cookies.get(sessionCookieName),
		config.sessionSecret,
		Date.now()
	);
	event.locals.authenticated = authenticated;

	if (!authenticated && !isPublicPath(pathname)) {
		const response = pathname.startsWith('/api/')
			? apiError('UNAUTHENTICATED', 401)
			: new Response(null, { status: 303, headers: { location: '/login' } });
		applySecurityHeaders(response, pathname);
		return response;
	}

	const response = await resolve(event);
	applySecurityHeaders(response, pathname);
	return response;
};
