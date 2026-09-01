import { describe, expect, test } from 'vitest';

import { accuracyCircle, locationMessage } from './map-location';

describe('map location helpers', (): void => {
	test('builds a closed accuracy circle', (): void => {
		const circle = accuracyCircle([16, 43], 25);
		expect(circle).toHaveLength(65);
		expect(circle[0]).toEqual(circle.at(-1));
		expect(circle.every(([longitude, latitude]) => Number.isFinite(longitude + latitude))).toBe(
			true
		);
	});

	test.each([
		['idle', ''],
		['active', ''],
		['locating', 'Finner posisjonen din …'],
		['denied', 'Du har ikke gitt tilgang til posisjonen din.'],
		['timeout', 'Det tok for lang tid å finne posisjonen.'],
		['unavailable', 'Posisjonen er ikke tilgjengelig.']
	] as const)('maps %s to its user message', (state, expected): void => {
		expect(locationMessage(state)).toBe(expected);
	});
});
