import { identifyUnit, type UnitOfMeasureDefinitions, unitsOfMeasure } from 'parse-ingredient';

import type { Rational } from './menu';

export const norwegianUnitDefinitions: UnitOfMeasureDefinitions = {
	stykk: {
		short: 'stk',
		plural: 'stykk',
		alternates: ['stykker'],
		type: 'count',
		conversionFactor: 1
	},
	centiliter: {
		short: 'cl',
		plural: 'centiliter',
		alternates: ['cl.'],
		type: 'volume',
		conversionFactor: 10
	},
	spiseskje: {
		short: 'ss',
		plural: 'spiseskjeer',
		alternates: ['ss.'],
		type: 'volume'
	},
	teskje: {
		short: 'ts',
		plural: 'teskjeer',
		alternates: ['ts.'],
		type: 'volume'
	}
};

export type ConvertibleUnit = {
	family: 'mass' | 'volume' | 'count';
	canonicalUnit: 'g' | 'ml' | 'stk';
	factor: Rational;
};

function exactDecimal(value: number): Rational | undefined {
	if (!Number.isFinite(value) || value <= 0) return undefined;
	if (Number.isInteger(value)) return { numerator: value, denominator: 1 };
	const text = value.toString();
	if (text.includes('e')) {
		const [coefficient = '', exponentText = ''] = text.split('e');
		const exponent = Number(exponentText);
		const digits = coefficient.replace('.', '');
		const decimalPlaces = coefficient.split('.')[1]?.length ?? 0;
		const power = exponent - decimalPlaces;
		return power >= 0
			? { numerator: Number(digits) * 10 ** power, denominator: 1 }
			: { numerator: Number(digits), denominator: 10 ** -power };
	}
	const decimals = text.split('.')[1]?.length ?? 0;
	const denominator = 10 ** decimals;
	return { numerator: Math.round(value * denominator), denominator };
}

export function resolveConvertibleUnit(value: string): ConvertibleUnit | undefined {
	const id = identifyUnit(value.trim(), { additionalUOMs: norwegianUnitDefinitions });
	if (!id) return undefined;
	const definition = norwegianUnitDefinitions[id] ?? unitsOfMeasure[id];
	if (!definition || typeof definition.conversionFactor !== 'number') return undefined;
	const factor = exactDecimal(definition.conversionFactor);
	if (!factor) return undefined;
	if (definition.type === 'mass') return { family: 'mass', canonicalUnit: 'g', factor };
	if (definition.type === 'volume') return { family: 'volume', canonicalUnit: 'ml', factor };
	if (definition.type === 'count') return { family: 'count', canonicalUnit: 'stk', factor };
	return undefined;
}
