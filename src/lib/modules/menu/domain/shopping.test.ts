import { describe, expect, test } from 'vitest';

import type { ShoppingPlanningSnapshot } from '$lib/modules/shopping-list/public';

import type { CurrentDish, MenuIngredient } from './menu';
import { createMenuShoppingPreview } from './shopping';

function ingredient(
	id: string,
	name: string,
	quantityText: string,
	unit: string,
	numerator: number,
	denominator = 1
): MenuIngredient {
	return {
		id,
		group: '',
		quantityText,
		normalizedQuantity: { numerator, denominator },
		unit,
		name,
		note: ''
	};
}

function dish(
	id: string,
	name: string,
	ingredients: MenuIngredient[],
	shoppingStatus = false,
	plannedServings = 4
): CurrentDish {
	return {
		archive: {
			version: 1,
			id,
			name,
			baseServings: 4,
			defaultPlannedServings: 4,
			ingredients,
			instructions: [],
			createdAt: '2026-08-25T10:00:00.000Z',
			createdBy: 'client-a',
			tombstone: false
		},
		active: {
			version: 1,
			archiveId: id,
			cycleId: id.replace(/^1/, '2'),
			categories: ['dinner'],
			plannedServings,
			activatedAt: '2026-08-25T10:00:00.000Z',
			activatedBy: 'client-a',
			...(shoppingStatus
				? {
						shoppingStatus: {
							appliedAt: '2026-08-25T11:00:00.000Z',
							batchId: 'batch-a',
							scope: 'menu' as const
						}
					}
				: {}),
			tombstone: false
		}
	};
}

const planning: ShoppingPlanningSnapshot = {
	snapshot: {
		listUuid: 'list-a',
		listName: 'Tur',
		items: [{ sourceName: 'Zucker', name: 'Sukker', specification: '300 g' }],
		recentItems: [],
		fetchedAt: '2026-08-25T10:00:00.000Z'
	},
	catalog: [{ sourceName: 'Zucker', name: 'Sukker' }]
};

describe('Menu shopping preview', (): void => {
	test('groups equal ingredients across dishes and adds the existing absolute amount', (): void => {
		const dishes = [
			dish('10000000-0000-4000-8000-000000000001', 'Kake', [
				ingredient('ingredient-a', 'Sukker', '200', 'g', 200)
			]),
			dish('10000000-0000-4000-8000-000000000002', 'Boller', [
				ingredient('ingredient-b', 'sukker', '0,5', 'kg', 1, 2)
			])
		];

		const preview = createMenuShoppingPreview(dishes, planning, 'menu', false);

		expect(preview.rows).toHaveLength(1);
		expect(preview.rows[0]).toMatchObject({
			name: 'Sukker',
			sourceName: 'Sukker',
			currentSpecification: '300 g',
			dishNames: ['Kake', 'Boller']
		});
		expect(preview.rows[0]?.proposedSpecification).toBe(
			'Totalt: 1 kg | Kake: 200 g; Boller: 0,5 kg | Fra før: 300 g'
		);
		expect(preview.rows[0]?.replacementSpecification).toBe(
			'Totalt: 700 g | Kake: 200 g; Boller: 0,5 kg'
		);
	});

	test('updates an earlier Menu description without nesting generated labels', (): void => {
		const preview = createMenuShoppingPreview(
			[
				dish('10000000-0000-4000-8000-000000000002', 'Boller', [
					ingredient('ingredient-b', 'Sukker', '200', 'g', 200)
				])
			],
			{
				snapshot: {
					...planning.snapshot,
					items: [
						{
							sourceName: 'Sukker',
							name: 'Sukker',
							specification: 'Totalt: 300 g | Fra før: Kjøp økologisk | Nytt: Kake: 300 g'
						}
					]
				},
				catalog: [{ sourceName: 'Sukker', name: 'Sukker' }]
			},
			'menu',
			false
		);

		expect(preview.rows[0]?.proposedSpecification).toBe(
			'Totalt: 500 g | Kake: 300 g; Boller: 200 g | Fra før: Kjøp økologisk'
		);
		expect(preview.rows[0]?.replacementSpecification).toBe('Totalt: 200 g | Boller: 200 g');
	});

	test('keeps every raw-unit contribution and scales it before whole-menu grouping', (): void => {
		const dishes = [
			dish(
				'10000000-0000-4000-8000-000000000001',
				'Pasta',
				[ingredient('ingredient-a', 'Bacon', '1', 'pakke', 1)],
				false,
				8
			),
			dish('10000000-0000-4000-8000-000000000002', 'Pizza', [
				ingredient('ingredient-b', 'bacon', '1', 'pakke', 1)
			])
		];

		const preview = createMenuShoppingPreview(dishes, planning, 'menu', false);

		expect(preview.rows).toHaveLength(1);
		expect(preview.rows[0]).toMatchObject({ dishNames: ['Pasta', 'Pizza'] });
		expect(preview.rows[0]?.proposedSpecification).toBe(
			'Totalt: 3 pakke | Pasta: 2 pakke; Pizza: 1 pakke'
		);
	});

	test('scales numeric quantities with an app-suggested unit even without stored normalization', (): void => {
		const tomatoes = ingredient('ingredient-a', 'Cherrytomater', '0,5', 'boks', 1, 2);
		delete tomatoes.normalizedQuantity;
		const preview = createMenuShoppingPreview(
			[dish('10000000-0000-4000-8000-000000000001', 'Salat', [tomatoes], false, 8)],
			planning,
			'menu',
			false
		);

		expect(preview.rows[0]?.proposedSpecification).toBe('Totalt: 1 boks | Salat: 1 boks');
	});

	test('lists only the dishes when equal ingredients have no quantity or unit', (): void => {
		const pastaBacon = ingredient('ingredient-a', 'Bacon', '', '', 0);
		const pizzaBacon = ingredient('ingredient-b', 'bacon', '', '', 0);
		delete pastaBacon.normalizedQuantity;
		delete pizzaBacon.normalizedQuantity;
		const preview = createMenuShoppingPreview(
			[
				dish('10000000-0000-4000-8000-000000000001', 'Pasta', [pastaBacon]),
				dish('10000000-0000-4000-8000-000000000002', 'Pizza', [pizzaBacon])
			],
			planning,
			'menu',
			false
		);

		expect(preview.rows).toHaveLength(1);
		expect(preview.rows[0]?.proposedSpecification).toBe('Til: Pasta, Pizza');

		const withExistingDescription = createMenuShoppingPreview(
			[
				dish('10000000-0000-4000-8000-000000000001', 'Pasta', [pastaBacon]),
				dish('10000000-0000-4000-8000-000000000002', 'Pizza', [pizzaBacon])
			],
			{
				snapshot: {
					...planning.snapshot,
					items: [{ sourceName: 'Bacon', name: 'Bacon', specification: 'Oppbevares kjølig' }]
				},
				catalog: []
			},
			'menu',
			false
		);
		expect(withExistingDescription.rows[0]?.proposedSpecification).toBe(
			'Til: Pasta, Pizza | Fra før: Oppbevares kjølig'
		);
		expect(withExistingDescription.rows[0]?.replacementSpecification).toBe('Til: Pasta, Pizza');
	});

	test('keeps mixed mass and volume as separate subtotals after a name correction', (): void => {
		const dishes = [
			dish('10000000-0000-4000-8000-000000000001', 'Brød', [
				ingredient('ingredient-a', 'Mel', '200', 'g', 200)
			]),
			dish('10000000-0000-4000-8000-000000000002', 'Saus', [
				ingredient('ingredient-b', 'Hvetemel', '3', 'dl', 3)
			])
		];
		const initial = createMenuShoppingPreview(dishes, planning, 'menu', false);
		const flour = initial.rows.find((row) => row.name === 'Hvetemel');

		const preview = createMenuShoppingPreview(dishes, planning, 'menu', false, {
			[flour?.id ?? '']: 'Mel'
		});

		expect(preview.rows).toHaveLength(1);
		expect(preview.rows[0]?.warnings).toContain(
			'Kan ikke regne om mellom vekt, volum eller stykk. Delsummene beholdes.'
		);
		expect(preview.rows[0]?.proposedSpecification).toBe(
			'Totalt: 200 g og 3 dl | Brød: 200 g; Saus: 3 dl'
		);
	});

	test('matches an existing custom Norwegian item before the catalog source item', (): void => {
		const preview = createMenuShoppingPreview(
			[
				dish('10000000-0000-4000-8000-000000000001', 'Kake', [
					ingredient('ingredient-a', ' sukker ', '200', 'g', 200)
				])
			],
			{
				snapshot: {
					...planning.snapshot,
					items: [{ sourceName: 'Sukker', name: 'Sukker', specification: '' }]
				},
				catalog: [{ sourceName: 'Zucker', name: 'Sukker' }]
			},
			'dish',
			false
		);

		expect(preview.rows[0]).toMatchObject({
			name: 'Sukker',
			sourceName: 'Sukker',
			alreadyInList: true,
			currentSpecification: ''
		});
		expect(preview.rows[0]?.proposedSpecification).toBe('Totalt: 200 g | Kake: 200 g');
	});

	test('rematches an edited Bring name and recalculates against the existing item', (): void => {
		const dishes = [
			dish('10000000-0000-4000-8000-000000000001', 'Pannekaker', [
				ingredient(
					'ingredient-a',
					'TINE® Helmelk 3,5 % fett eller Tinemelk® Økologisk Helmelk',
					'2',
					'dl',
					2
				)
			])
		];
		const milkPlanning: ShoppingPlanningSnapshot = {
			snapshot: {
				...planning.snapshot,
				items: [{ sourceName: 'Milch', name: 'Melk', specification: '2 l' }]
			},
			catalog: [{ sourceName: 'Milch', name: 'Melk' }]
		};
		const initial = createMenuShoppingPreview(dishes, milkPlanning, 'dish', false);
		const id = initial.rows[0]?.id ?? '';

		const rematched = createMenuShoppingPreview(dishes, milkPlanning, 'dish', false, {
			[id]: 'melk'
		});

		expect(initial.rows[0]).toMatchObject({ alreadyInList: false });
		expect(rematched.rows[0]).toMatchObject({
			id,
			name: 'Melk',
			sourceName: 'Melk',
			alreadyInList: true,
			currentSpecification: '2 l'
		});
		expect(rematched.rows[0]?.proposedSpecification).toBe(
			'Totalt: 2,2 l | Pannekaker: 2 dl | Fra før: 2 l'
		);
	});

	test('combines differently written ingredients after correcting them to the same name', (): void => {
		const dishes = [
			dish('10000000-0000-4000-8000-000000000001', 'Pannekaker', [
				ingredient(
					'ingredient-a',
					'TINE® Helmelk 3,5 % fett eller Tinemelk® Økologisk Helmelk',
					'2',
					'dl',
					2
				)
			]),
			dish('10000000-0000-4000-8000-000000000002', 'Saus', [
				ingredient('ingredient-b', 'Melk', '3', 'dl', 3)
			])
		];
		const milkPlanning: ShoppingPlanningSnapshot = {
			snapshot: { ...planning.snapshot, items: [] },
			catalog: [{ sourceName: 'Milch', name: 'Melk' }]
		};
		const initial = createMenuShoppingPreview(dishes, milkPlanning, 'menu', false);
		const brandedMilk = initial.rows.find((row) => row.name.startsWith('TINE'));

		expect(initial.rows).toHaveLength(2);
		const corrected = createMenuShoppingPreview(dishes, milkPlanning, 'menu', false, {
			[brandedMilk?.id ?? '']: 'Melk'
		});

		expect(corrected.rows).toHaveLength(1);
		expect(corrected.rows[0]).toMatchObject({
			name: 'Melk',
			sourceName: 'Melk',
			dishNames: ['Pannekaker', 'Saus']
		});
		expect(corrected.rows[0]?.sourceRowIds).toHaveLength(2);
		expect(corrected.rows[0]?.proposedSpecification).toBe(
			'Totalt: 500 ml | Pannekaker: 2 dl; Saus: 3 dl'
		);
	});

	test('skips dishes already added by the whole-menu action unless requested', (): void => {
		const previous = dish(
			'10000000-0000-4000-8000-000000000001',
			'Kake',
			[ingredient('ingredient-a', 'Sukker', '200', 'g', 200)],
			true
		);

		const preview = createMenuShoppingPreview([previous], planning, 'menu', false);
		const repeated = createMenuShoppingPreview([previous], planning, 'menu', true);

		expect(preview.rows).toEqual([]);
		expect(preview.skippedDishes).toEqual(['Kake']);
		expect(repeated.rows).toHaveLength(1);
	});
});
