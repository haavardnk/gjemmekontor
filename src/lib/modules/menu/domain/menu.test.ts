import { describe, expect, test } from 'vitest';

import {
	consumeDishCategory,
	type CurrentDish,
	matchingArchives,
	type MenuActive,
	type MenuArchive,
	moveDishCategory,
	orderedDishesInCategory,
	reactivateDish
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

function dish(id: string, name: string, menuActive: MenuActive): CurrentDish {
	return {
		archive: archive({ id, name }),
		active: menuActive
	};
}

describe('Menu domain', (): void => {
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
		const dishes = [
			dish(archiveId, 'First dish', active({ categoryOrder: { lunch: 0, dinner: 1 } })),
			dish(
				secondId,
				'Second dish',
				active({ archiveId: secondId, categoryOrder: { lunch: 1, dinner: 0 } })
			)
		];

		expect(orderedDishesInCategory(dishes, 'lunch').map(({ archive }) => archive.name)).toEqual([
			'First dish',
			'Second dish'
		]);
		expect(orderedDishesInCategory(dishes, 'dinner').map(({ archive }) => archive.name)).toEqual([
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
