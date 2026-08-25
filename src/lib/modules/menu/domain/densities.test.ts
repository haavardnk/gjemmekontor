import { describe, expect, test } from 'vitest';

import { densityNameForIngredient, ingredientMeasurement } from './densities';
import type { MenuIngredient } from './menu';

function ingredient(name: string, quantity: number, unit: string): MenuIngredient {
	return {
		id: crypto.randomUUID(),
		group: '',
		quantityText: String(quantity),
		normalizedQuantity: { numerator: quantity, denominator: 1 },
		unit,
		name,
		note: ''
	};
}

describe('Cooking ingredient measurements', (): void => {
	test('converts known ingredients between volume and mass after serving scaling', (): void => {
		expect(ingredientMeasurement(ingredient('Vann', 2, 'dl'), 8, 4, 'mass')).toEqual({
			text: '400 g',
			approximate: true,
			converted: true
		});
		expect(ingredientMeasurement(ingredient('Hvetemel', 110, 'g'), 4, 4, 'volume')).toEqual({
			text: '2 dl',
			approximate: true,
			converted: true
		});
		expect(ingredientMeasurement(ingredient('Sukker', 1, 'dl'), 4, 4, 'mass').text).toBe('90 g');
		expect(ingredientMeasurement(ingredient('Ris', 60, 'g'), 4, 4, 'volume').text).toBe('1 dl');
	});

	test('recognizes branded milk but leaves unknown ingredients unchanged', (): void => {
		expect(densityNameForIngredient('TINE® Helmelk 3,5 % fett')).toBe('milk');
		expect(ingredientMeasurement(ingredient('Peanøttsmør', 2, 'dl'), 4, 4, 'mass')).toEqual({
			text: '2 dl',
			approximate: false,
			converted: false
		});
	});

	test('covers common pantry and dairy ingredients without broad substring matches', (): void => {
		expect(ingredientMeasurement(ingredient('Smør', 1, 'dl'), 4, 4, 'mass').text).toBe('85 g');
		expect(ingredientMeasurement(ingredient('Havregryn', 1, 'dl'), 4, 4, 'mass').text).toBe('40 g');
		expect(ingredientMeasurement(ingredient('Olivenolje', 1, 'dl'), 4, 4, 'mass').text).toBe(
			'90 g'
		);
		expect(ingredientMeasurement(ingredient('Honning', 1, 'dl'), 4, 4, 'mass').text).toBe('140 g');
		expect(ingredientMeasurement(ingredient('Grovt salt', 110, 'g'), 4, 4, 'volume').text).toBe(
			'1 dl'
		);
		expect(densityNameForIngredient('Peanøttsmør')).toBeUndefined();
	});
});
