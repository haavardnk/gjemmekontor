import { moduleForApiPath } from '$lib/app/modules/catalog';

import type { LiveUpdate } from './live-updates';

export type LiveInvalidation = {
	tripId: string;
	update: LiveUpdate;
};

const ignoredMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function liveInvalidation(
	pathname: string,
	method: string,
	selectedTripId?: string
): LiveInvalidation | undefined {
	if (ignoredMethods.has(method)) return undefined;
	const stateMatch = pathname.match(/^\/api\/trips\/([^/]+)\/state\/sync$/);
	if (stateMatch?.[1]) {
		return {
			tripId: stateMatch[1],
			update: { state: true, modules: [], reload: false }
		};
	}
	const adminMatch = pathname.match(/^\/admin\/trips\/([^/]+)$/);
	if (adminMatch?.[1] && method === 'POST') {
		return {
			tripId: adminMatch[1],
			update: { state: true, modules: [], reload: true }
		};
	}
	if (!selectedTripId) return undefined;
	const module = moduleForApiPath(pathname);
	if (!module) return undefined;
	const usesSharedState = 'statePrefixes' in module && module.statePrefixes.length > 0;
	const modules = new Set<string>();
	if (!usesSharedState) modules.add(module.id);
	if (pathname === '/api/menu/shopping/apply') modules.add('shopping-list');
	return {
		tripId: selectedTripId,
		update: {
			state: usesSharedState,
			modules: [...modules],
			reload: false
		}
	};
}
