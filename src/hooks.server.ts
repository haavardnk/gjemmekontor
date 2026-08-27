import type { Handle } from '@sveltejs/kit';

import { firstEnabledModulePath } from '$lib/app/modules/activation';
import {
	isCacheableModuleApi,
	moduleForApiPath,
	moduleForPagePath
} from '$lib/app/modules/catalog';
import { getDatabase } from '$lib/app/server/database';
import { getTripBySlug } from '$lib/app/server/trips';
import { apiError } from '$lib/server/api';
import {
	isAdminAuthorized,
	isTripAuthorized,
	selectedTripCookieName,
	sessionCookieName
} from '$lib/server/auth';
import { getRuntimeConfig } from '$lib/server/env';

const publicPaths = new Set(['/trips', '/admin/login', '/api/health']);

function isPublicPath(pathname: string): boolean {
	return (
		publicPaths.has(pathname) ||
		/^\/t\/[^/]+\/unlock$/.test(pathname) ||
		pathname.startsWith('/_app/') ||
		pathname === '/service-worker.js' ||
		/\.[a-z0-9]+$/i.test(pathname)
	);
}

function applySecurityHeaders(response: Response, pathname: string): void {
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set(
		'Referrer-Policy',
		pathname === '/map' ? 'strict-origin-when-cross-origin' : 'no-referrer'
	);
	response.headers.set('X-Frame-Options', 'DENY');
	if (
		/^\/api\/(auth|state)(\/|$)/.test(pathname) ||
		(moduleForApiPath(pathname) && !isCacheableModuleApi(pathname))
	) {
		response.headers.set('Cache-Control', 'no-store');
	}
}

function denied(pathname: string, location: string): Response {
	return pathname.startsWith('/api/')
		? apiError('UNAUTHENTICATED', 401)
		: new Response(null, { status: 303, headers: { location } });
}

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const config = getRuntimeConfig();
	const db = getDatabase();
	if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
		const origin = event.request.headers.get('origin');
		if (origin !== config.origin) {
			const response = pathname.startsWith('/api/')
				? apiError('INVALID_ORIGIN', 403)
				: new Response('Forbidden', { status: 403 });
			applySecurityHeaders(response, pathname);
			return response;
		}
	}
	const now = Date.now();
	const token = event.cookies.get(sessionCookieName);
	const selectedSlug = event.cookies.get(selectedTripCookieName);
	const trip = selectedSlug ? getTripBySlug(db, selectedSlug) : undefined;
	const adminAuthenticated = isAdminAuthorized(db, token, config, now);
	const tripAuthenticated = trip
		? isTripAuthorized(db, token, trip.id, config.sessionSecret, now)
		: false;

	event.locals.adminAuthenticated = adminAuthenticated;
	event.locals.tripAuthenticated = tripAuthenticated;
	if (trip) {
		event.locals.trip = {
			id: trip.id,
			slug: trip.slug,
			name: trip.name,
			enabledModuleIds: trip.enabledModuleIds
		};
	}

	if (pathname.startsWith('/admin/') && pathname !== '/admin/login' && !adminAuthenticated) {
		const response = denied(pathname, '/admin/login');
		applySecurityHeaders(response, pathname);
		return response;
	}

	if (
		!isPublicPath(pathname) &&
		pathname !== '/' &&
		!pathname.startsWith('/admin/') &&
		!pathname.startsWith('/api/auth/')
	) {
		if (!trip || !tripAuthenticated) {
			const response = denied(pathname, trip ? `/t/${trip.slug}/unlock` : '/trips');
			applySecurityHeaders(response, pathname);
			return response;
		}
	}

	const requestedModule = pathname.startsWith('/api/')
		? moduleForApiPath(pathname)
		: moduleForPagePath(pathname);
	if (requestedModule && trip && !trip.enabledModuleIds.includes(requestedModule.id)) {
		const fallback = trip.enabledModuleIds.length
			? firstEnabledModulePath(trip.enabledModuleIds)
			: '/trips';
		const response = pathname.startsWith('/api/')
			? apiError('MODULE_DISABLED', 404)
			: new Response(null, { status: 303, headers: { location: fallback } });
		applySecurityHeaders(response, pathname);
		return response;
	}

	const response = await resolve(event);
	applySecurityHeaders(response, pathname);
	return response;
};
