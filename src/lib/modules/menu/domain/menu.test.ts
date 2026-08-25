import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';

import {
	consumeDishCategory,
	currentDishes,
	matchingArchives,
	type MenuActive,
	menuActiveKey,
	type MenuArchive,
	menuArchiveKey,
	menuArchives,
	moveDishCategory,
	orderedDishesInCategory,
	reactivateDish,
	serializeMenuActive,
	serializeMenuArchive
} from './menu';

const archiveId = '10000000-0000-4000-8000-000000000001';
const cycleId = '20000000-0000-4000-8000-000000000001';

function archive(overrides: Partial<MenuArchive> = {}): MenuArchive {
	return {
		version: 1,
		id: archiveId,
		name: 'Åpen lasagne',
		baseServings: 4,
		defaultPlannedServings: 4,
		ingredients: [],
		instructions: [],
		createdAt: '2026-08-25T10:00:00.000Z',
		createdBy: 'client-a',
		tombstone: false,
		...overrides
	};
}

function active(overrides: Partial<MenuActive> = {}): MenuActive {
	return {
		version: 1,
		archiveId,
		cycleId,
		categories: ['lunch', 'dinner'],
		plannedServings: 4,
		activatedAt: '2026-08-25T10:00:00.000Z',
		activatedBy: 'client-a',
		tombstone: false,
		...overrides
	};
}

describe('Menu domain', (): void => {
	test('joins only valid linked archive and active rows', (): void => {
		const values: Record<string, JsonValue> = {
			[menuArchiveKey(archiveId)]: serializeMenuArchive(archive()),
			[menuActiveKey(archiveId)]: serializeMenuActive(active()),
			'menu:archive:bad': { name: 'invalid' }
		};

		expect(currentDishes(values)).toHaveLength(1);
		expect(currentDishes(values)[0]?.archive.name).toBe('Åpen lasagne');
		expect(() => serializeMenuArchive(currentDishes(values)[0]!.archive)).not.toThrow();
		expect(() => serializeMenuActive(currentDishes(values)[0]!.active)).not.toThrow();
	});

	test('sorts archives using Norwegian ordering with stable fallback', (): void => {
		const secondId = '10000000-0000-4000-8000-000000000002';
		const values = {
			[menuArchiveKey(archiveId)]: serializeMenuArchive(archive()),
			[menuArchiveKey(secondId)]: serializeMenuArchive(archive({ id: secondId, name: 'Eplekake' }))
		};

		expect(menuArchives(values).map((entry) => entry.name)).toEqual(['Eplekake', 'Åpen lasagne']);
	});

	test('moves and consumes one category without duplicating a dish', (): void => {
		const moved = moveDishCategory(active(), 'lunch', 'breakfast');
		const remaining = consumeDishCategory(moved, 'breakfast');
		const removed = consumeDishCategory(remaining, 'dinner');

		expect(moved.categories).toEqual(['breakfast', 'dinner']);
		expect(remaining.categories).toEqual(['dinner']);
		expect(removed.tombstone).toBe(true);
	});

	test('orders dishes independently within each meal category', (): void => {
		const secondId = '10000000-0000-4000-8000-000000000002';
		const values: Record<string, JsonValue> = {
			[menuArchiveKey(archiveId)]: serializeMenuArchive(archive({ name: 'First dish' })),
			[menuActiveKey(archiveId)]: serializeMenuActive(
				active({ categoryOrder: { lunch: 0, dinner: 1 } })
			),
			[menuArchiveKey(secondId)]: serializeMenuArchive(
				archive({ id: secondId, name: 'Second dish' })
			),
			[menuActiveKey(secondId)]: serializeMenuActive(
				active({ archiveId: secondId, categoryOrder: { lunch: 1, dinner: 0 } })
			)
		};
		const dishes = currentDishes(values);

		expect(orderedDishesInCategory(dishes, 'lunch').map((dish) => dish.archive.name)).toEqual([
			'First dish',
			'Second dish'
		]);
		expect(orderedDishesInCategory(dishes, 'dinner').map((dish) => dish.archive.name)).toEqual([
			'Second dish',
			'First dish'
		]);
	});

	test('reactivates with a fresh cycle and no inherited shopping status', (): void => {
		const result = reactivateDish(
			archiveId,
			['dinner', 'breakfast'],
			6,
			'2026-08-26T10:00:00.000Z',
			'client-b',
			'20000000-0000-4000-8000-000000000002'
		);

		expect(result.categories).toEqual(['breakfast', 'dinner']);
		expect(result.shoppingStatus).toBeUndefined();
	});

	test('finds exact normalized name and source URL matches without merging', (): void => {
		const entries = [archive({ sourceUrl: 'https://example.com/recipe?a=1#top' })];

		expect(matchingArchives(entries, '  ÅPEN   LASAGNE ')).toEqual(entries);
		expect(matchingArchives(entries, 'Different', 'https://EXAMPLE.com/recipe?a=1')).toEqual(
			entries
		);
	});
});
