import { describe, expect, test } from 'vitest';

import { kroatia2026Days as tripDays } from '$lib/trip/kroatia-2026';

import { activityModuleIds, scenarioGroups, shotModules } from './content';
import { withShotsDayPlan } from './day-plan';

describe('trip shot content', (): void => {
	const shotsDays = tripDays.map(withShotsDayPlan);

	test('keeps scene references valid and unique', (): void => {
		const missing = shotsDays.flatMap((day) => day.modules.filter((id) => !shotModules[id]));

		expect(missing).toEqual([]);
		expect(activityModuleIds).toHaveLength(36);
		expect(new Set(activityModuleIds).size).toBe(activityModuleIds.length);
		const groupedIds = scenarioGroups.flatMap((group) => group.ids);
		expect(new Set(groupedIds)).toEqual(new Set(activityModuleIds));
		expect(groupedIds).toHaveLength(activityModuleIds.length);
	});

	test('keeps every scene structurally complete', (): void => {
		for (const module of Object.values(shotModules)) {
			expect(module.title.trim().length).toBeGreaterThan(0);
			expect(module.shots.length).toBeGreaterThan(0);
			expect(module.shots.every((shot) => shot.text.trim().length > 0)).toBe(true);
			expect(module.aRoll.every((index) => index >= 0 && index < module.shots.length)).toBe(true);
			expect(new Set(module.aRoll).size).toBe(module.aRoll.length);
		}
	});

	test('keeps camera suggestions person-neutral', (): void => {
		const suggestions = Object.values(shotModules).flatMap((module) => [
			module.camera,
			...module.shots.flatMap((shot) => (shot.camera ? [shot.camera] : []))
		]);

		expect(suggestions.every((suggestion) => !/Odd|Håvard/.test(suggestion))).toBe(true);
		expect(suggestions.some((suggestion) => suggestion.includes('Osmo Action 4'))).toBe(true);
	});

	test('keeps flexible boat days free of fixed scenes', (): void => {
		const ordinaryBoatDays = shotsDays.filter((day) => day.flexible);

		expect(ordinaryBoatDays.every((day) => day.modules.length === 0)).toBe(true);
	});

	test('keeps activity scenes optional on villa days', (): void => {
		const villaDays = shotsDays.filter((day) => day.core === 'villa');

		expect(
			villaDays.every((day) => day.modules.every((id) => !activityModuleIds.includes(id)))
		).toBe(true);
	});

	test('keeps scene shot lists video-only', (): void => {
		const visibleCopy = Object.values(shotModules)
			.flatMap((module) => [module.title, ...module.shots.map((shot) => shot.text)])
			.join(' ');

		expect(visibleCopy).not.toMatch(/bilde|foto/i);
	});
});
