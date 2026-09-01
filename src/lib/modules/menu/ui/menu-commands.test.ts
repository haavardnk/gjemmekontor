import { describe, expect, test } from 'vitest';

import type {
	MenuActive,
	MenuEditorValue,
	MenuPageData,
	RecipeArchiveView,
	TripMenuDish
} from '../domain/menu';
import {
	consumeMenuDish,
	type MenuCommandIdentity,
	reorderMenuDish,
	saveMenuEditor
} from './menu-commands';

const archiveId = '11111111-1111-4111-8111-111111111111';
const secondArchiveId = '22222222-2222-4222-8222-222222222222';
const cycleId = '33333333-3333-4333-8333-333333333333';
const entryId = '44444444-4444-4444-8444-444444444444';
const secondEntryId = '55555555-5555-4555-8555-555555555555';

function archive(id = archiveId, name = 'Pasta'): RecipeArchiveView {
	return {
		version: 1,
		id,
		name,
		baseServings: 4,
		defaultPlannedServings: 4,
		ingredients: [],
		instructions: [],
		createdAt: '2027-01-01T10:00:00.000Z',
		createdBy: 'client-a',
		tombstone: false,
		recipeVersionId: `version:${id}`,
		recipeVersion: 1
	};
}

function active(id = archiveId): MenuActive {
	return {
		version: 1,
		archiveId: id,
		cycleId,
		categories: ['dinner'],
		plannedServings: 4,
		activatedAt: '2027-01-01T10:00:00.000Z',
		activatedBy: 'client-a',
		tombstone: false
	};
}

function dish(id = archiveId, name = 'Pasta', selectedEntryId = entryId): TripMenuDish {
	return {
		archive: archive(id, name),
		active: active(id),
		entryId: selectedEntryId,
		latestRecipeVersion: 1
	};
}

function identity(ids: string[]): MenuCommandIdentity {
	let index = 0;
	return {
		clientId: 'client-b',
		now: '2027-02-01T10:00:00.000Z',
		randomId: () => ids[index++]!
	};
}

const editor: MenuEditorValue = {
	name: 'Ny rett',
	baseServings: 4,
	defaultPlannedServings: 4,
	plannedServings: 6,
	categories: ['dinner'],
	ingredients: [],
	instructions: []
};

describe('menu command plans', (): void => {
	test('creates and activates a new recipe atomically in the optimistic snapshot', (): void => {
		const ids = [
			'66666666-6666-4666-8666-666666666666',
			'77777777-7777-4777-8777-777777777777',
			'88888888-8888-4888-8888-888888888888',
			'99999999-9999-4999-8999-999999999999'
		];
		const mutation = saveMenuEditor(
			{ archives: [], dishes: [] },
			{ activateOnSave: true, initial: editor },
			editor,
			identity(ids)
		);

		expect(mutation.next.archives[0]).toMatchObject({ id: ids[0], name: 'Ny rett' });
		expect(mutation.next.dishes[0]).toMatchObject({
			entryId: ids[3],
			active: { cycleId: ids[1], plannedServings: 6 }
		});
		expect(mutation.requests.map((request) => request.path)).toEqual([
			'/api/menu/recipes',
			'/api/menu/entries'
		]);
	});

	test('removes a dish after its final meal category is consumed', (): void => {
		const currentDish = dish();
		const mutation = consumeMenuDish(
			{ archives: [currentDish.archive], dishes: [currentDish] },
			currentDish,
			'dinner'
		);

		expect(mutation.next.dishes).toEqual([]);
		expect(mutation.requests[0]).toMatchObject({
			path: `/api/menu/entries/${entryId}`,
			body: { active: expect.objectContaining({ tombstone: true }) }
		});
	});

	test('reorders a category and queues every affected entry update', (): void => {
		const first = dish();
		const second = dish(secondArchiveId, 'Risotto', secondEntryId);
		const data: MenuPageData = {
			archives: [first.archive, second.archive],
			dishes: [first, second]
		};
		const mutation = reorderMenuDish(data, first, 'dinner', 1);

		expect(mutation?.requests).toHaveLength(2);
		expect(
			mutation?.next.dishes.find((candidate) => candidate.entryId === first.entryId)?.active
				.categoryOrder?.dinner
		).toBe(1);
		expect(
			mutation?.next.dishes.find((candidate) => candidate.entryId === second.entryId)?.active
				.categoryOrder?.dinner
		).toBe(0);
	});
});
