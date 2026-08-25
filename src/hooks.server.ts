import type { Handle } from '@sveltejs/kit';

import { firstEnabledModulePath, resolveEnabledModuleIds } from '$lib/app/modules/activation';
import {
	isCacheableModuleApi,
	moduleForApiPath,
	moduleForPagePath
} from '$lib/app/modules/catalog';
import { validateEnabledModuleConfiguration } from '$lib/app/modules/server-config';
import { getDatabase } from '$lib/app/server/database';
import { apiError } from '$lib/server/api';
import { isSessionValid, sessionCookieName } from '$lib/server/auth';
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
		/^\/api\/(auth|state)(\/|$)/.test(pathname) ||
		(moduleForApiPath(pathname) && !isCacheableModuleApi(pathname))
	) {
		response.headers.set('Cache-Control', 'no-store');
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const config = getRuntimeConfig();
	const enabledModuleIds = resolveEnabledModuleIds(config.enabledModuleIds);
	validateEnabledModuleConfiguration(enabledModuleIds);
	const enabledModules = new Set(enabledModuleIds);
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

	const requestedModule = pathname.startsWith('/api/')
		? moduleForApiPath(pathname)
		: moduleForPagePath(pathname);
	if (requestedModule && !enabledModules.has(requestedModule.id)) {
		const response = pathname.startsWith('/api/')
			? apiError('MODULE_DISABLED', 404)
			: new Response(null, {
					status: 303,
					headers: { location: firstEnabledModulePath(enabledModuleIds) }
				});
		applySecurityHeaders(response, pathname);
		return response;
	}

	const response = await resolve(event);
	applySecurityHeaders(response, pathname);
	return response;
};
