import { describe, expect, test } from 'vitest';

import { cookingGesture } from './cooking-session';

describe('cooking gestures', (): void => {
	test.each([
		[{ x: 100, y: 100 }, { x: 180, y: 110 }, false, 'ingredients'],
		[{ x: 100, y: 100 }, { x: 100, y: 20 }, false, 'next'],
		[{ x: 100, y: 100 }, { x: 100, y: 180 }, false, 'previous'],
		[{ x: 100, y: 100 }, { x: 100, y: 20 }, true, undefined],
		[{ x: 100, y: 100 }, { x: 140, y: 130 }, false, undefined]
	] as const)('classifies pointer movement', (start, end, ingredients, expected): void => {
		expect(cookingGesture(start, end, ingredients)).toBe(expected);
	});
});
