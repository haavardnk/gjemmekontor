import { describe, expect, test } from 'vitest';

import { resolveConvertibleUnit } from './units';

describe('Menu units', (): void => {
	test('uses parse-ingredient definitions with exact metric factors and Norwegian aliases', (): void => {
		expect(resolveConvertibleUnit('kg')).toEqual({
			family: 'mass',
			canonicalUnit: 'g',
			factor: { numerator: 1_000, denominator: 1 }
		});
		expect(resolveConvertibleUnit('dl')).toEqual({
			family: 'volume',
			canonicalUnit: 'ml',
			factor: { numerator: 100, denominator: 1 }
		});
		expect(resolveConvertibleUnit('stk')).toEqual({
			family: 'count',
			canonicalUnit: 'stk',
			factor: { numerator: 1, denominator: 1 }
		});
	});

	test('does not invent conversions for descriptive spoon units or unknown units', (): void => {
		expect(resolveConvertibleUnit('ss')).toBeUndefined();
		expect(resolveConvertibleUnit('klype')).toBeUndefined();
	});
});
