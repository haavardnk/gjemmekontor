import { describe, expect, test } from 'vitest';

import {
	baseQuantityFromDisplayedText,
	displayQuantity,
	parseRational,
	planIngredients,
	scaledIngredientQuantityText
} from './quantities';

describe('Menu quantities', (): void => {
	test.each([
		['1,5', { numerator: 3, denominator: 2 }],
		['1 1/2', { numerator: 3, denominator: 2 }],
		['⅓', { numerator: 1, denominator: 3 }],
		['2½', { numerator: 5, denominator: 2 }]
	] as const)('parses %s exactly', (text, expected): void => {
		expect(parseRational(text)).toEqual(expected);
	});

	test('scales and combines equal compatible ingredients across dishes', (): void => {
		const result = planIngredients([
			{
				archiveId: 'a',
				dishName: 'Taco',
				baseServings: 4,
				plannedServings: 8,
				ingredients: [
					{
						id: '10000000-0000-4000-8000-000000000001',
						group: '',
						quantityText: '200',
						normalizedQuantity: { numerator: 200, denominator: 1 },
						unit: 'g',
						name: 'Tomat',
						note: ''
					}
				]
			},
			{
				archiveId: 'b',
				dishName: 'Salat',
				baseServings: 4,
				plannedServings: 4,
				ingredients: [
					{
						id: '10000000-0000-4000-8000-000000000002',
						group: '',
						quantityText: '0,5',
						normalizedQuantity: { numerator: 1, denominator: 2 },
						unit: 'kg',
						name: 'tomat',
						note: ''
					}
				]
			}
		]);

		expect(result).toHaveLength(1);
		expect(displayQuantity(result[0]!.quantity!, result[0]!.unit)).toBe('900 g');
		expect(result[0]?.contributions).toHaveLength(2);
	});

	test('recalculates displayed recipe quantities and converts edits back to the base recipe', (): void => {
		const ingredient = {
			id: '10000000-0000-4000-8000-000000000001',
			group: '',
			quantityText: '2,5',
			normalizedQuantity: { numerator: 5, denominator: 2 },
			unit: 'dl',
			name: 'Melk',
			note: ''
		};

		expect(scaledIngredientQuantityText(ingredient, 8, 4)).toBe('5');
		expect(baseQuantityFromDisplayedText('6', 8, 4)).toEqual({
			numerator: 3,
			denominator: 1
		});
	});
});
