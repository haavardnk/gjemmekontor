import { describe, expect, test } from 'vitest';

import { kroatia2026Days as tripDays } from '$lib/trip/kroatia-2026';

import { activityModuleIds, backupChecks, scenarioGroups, shotModules } from './content';
import { shotsDayPlan } from './day-plan';
import { cameraChoices } from './digest';
import { blankShotContent, shotContentSchema, standardShotContent } from './pack';

describe('shot content packs', (): void => {
	test('validates the complete Kroatia content pack', (): void => {
		const content = shotContentSchema.parse({
			version: 1,
			cameras: cameraChoices,
			backupChecks,
			modules: shotModules,
			activityModuleIds,
			scenarioGroups,
			dayPlans: tripDays.map((day) => ({ dayIndex: day.index, ...shotsDayPlan(day.index) }))
		});

		expect(Object.keys(content.modules)).toHaveLength(Object.keys(shotModules).length);
		expect(content.dayPlans).toHaveLength(tripDays.length);
	});

	test('rejects broken scene and day references', (): void => {
		const content = standardShotContent(tripDays);

		expect(
			shotContentSchema.safeParse({
				...content,
				activityModuleIds: ['missing'],
				scenarioGroups: [{ title: 'Ugyldig', ids: ['missing'] }],
				dayPlans: [{ ...content.dayPlans[0], modules: ['missing'] }]
			}).success
		).toBe(false);
	});

	test('creates distinct blank and standard starting points', (): void => {
		const blank = blankShotContent(tripDays.slice(0, 2));
		const standard = standardShotContent(tripDays.slice(0, 2));

		expect(blank.modules).toEqual({});
		expect(blank.dayPlans).toHaveLength(2);
		expect(Object.keys(standard.modules).length).toBeGreaterThan(0);
		expect(standard.activityModuleIds).toEqual(
			standard.scenarioGroups.flatMap((group) => group.ids)
		);
	});
});
