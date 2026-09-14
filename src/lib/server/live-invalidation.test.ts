import { describe, expect, test } from 'vitest';

import { liveInvalidation } from './live-invalidation';

describe('live invalidation', (): void => {
	test.each([
		[
			'/api/trips/trip-a/state/sync',
			'POST',
			undefined,
			{ tripId: 'trip-a', update: { state: true, modules: [], reload: false } }
		],
		[
			'/api/shopping-list/items',
			'PATCH',
			'trip-a',
			{
				tripId: 'trip-a',
				update: { state: false, modules: ['shopping-list'], reload: false }
			}
		],
		[
			'/api/menu/shopping/apply',
			'POST',
			'trip-a',
			{
				tripId: 'trip-a',
				update: { state: false, modules: ['menu', 'shopping-list'], reload: false }
			}
		],
		[
			'/api/rule-book/preferences',
			'POST',
			'trip-a',
			{ tripId: 'trip-a', update: { state: true, modules: [], reload: false } }
		],
		[
			'/admin/trips/trip-b',
			'POST',
			'trip-a',
			{ tripId: 'trip-b', update: { state: true, modules: [], reload: true } }
		]
	] as const)('classifies %s', (pathname, method, tripId, expected): void => {
		expect(liveInvalidation(pathname, method, tripId)).toEqual(expected);
	});

	test('ignores reads, failed authentication helpers, and unscoped mutations', (): void => {
		expect(liveInvalidation('/api/shopping-list', 'GET', 'trip-a')).toBeUndefined();
		expect(liveInvalidation('/api/auth/logout', 'POST', 'trip-a')).toBeUndefined();
		expect(liveInvalidation('/api/shopping-list/items', 'POST')).toBeUndefined();
	});
});
