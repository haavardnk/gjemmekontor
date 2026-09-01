import { describe, expect, test } from 'vitest';

import type { TripDay } from '$lib/trip/itinerary';

import { blankShotContent, shotContentSchema, standardShotContent } from './pack';

const tripDays: TripDay[] = Array.from({ length: 3 }, (_, index) => ({
	id: `test-day-${index + 1}`,
	index,
	date: `2027-06-0${index + 1}`,
	dateLabel: `Testdag ${index + 1}`,
	title: `Dag ${index + 1}`,
	phase: 'Testfase'
}));

describe('shot content packs', (): void => {
	test('validates the generic standard content pack', (): void => {
		const content = shotContentSchema.parse(standardShotContent(tripDays));

		expect(Object.keys(content.modules).length).toBeGreaterThan(0);
		expect(content.dayPlans).toHaveLength(tripDays.length);
	});

	test('strips obsolete trip-specific day metadata from persisted packs', (): void => {
		const content = standardShotContent(tripDays);
		const parsed = shotContentSchema.parse({
			...content,
			dayPlans: content.dayPlans.map((plan) => ({
				...plan,
				obsolete: true
			}))
		});

		expect(parsed.dayPlans).toEqual(content.dayPlans);
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
