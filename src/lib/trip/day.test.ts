import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test } from 'vitest';

import { openClientDatabase } from '$lib/client/database';

import { TripDayState } from './day.svelte';
import { dateKeyAt, tripDayIndexAt } from './itinerary';

const databaseNames: string[] = [];
const testTimeZone = 'Europe/Oslo';
const testDays = Array.from({ length: 19 }, (_, index) => {
	const date = new Date(Date.UTC(2027, 5, 1 + index)).toISOString().slice(0, 10);
	return {
		id: `test-day-${index}`,
		index,
		date,
		dateLabel: `Dag ${index + 1}`,
		title: `Testdag ${index + 1}`,
		phase: 'Test'
	};
});

afterEach(async (): Promise<void> => {
	for (const name of databaseNames.splice(0)) {
		await deleteDB(name);
	}
});

function databaseName(): string {
	const name = `gjemmekontor-trip-day-${crypto.randomUUID()}`;
	databaseNames.push(name);
	return name;
}

function state(options: ConstructorParameters<typeof TripDayState>[0] = {}): TripDayState {
	return new TripDayState({ days: testDays, timeZone: testTimeZone, ...options });
}

describe('trip day selection', (): void => {
	test('uses the calendar date in Oslo at UTC boundaries', (): void => {
		expect(dateKeyAt(new Date('2027-05-31T22:00:00.000Z'), testTimeZone)).toBe('2027-06-01');
		expect(tripDayIndexAt(new Date('2027-05-31T22:00:00.000Z'), testDays, testTimeZone)).toBe(0);
		expect(tripDayIndexAt(new Date('2027-06-19T21:59:59.000Z'), testDays, testTimeZone)).toBe(18);
		expect(
			tripDayIndexAt(new Date('2027-06-19T22:00:00.000Z'), testDays, testTimeZone)
		).toBeUndefined();
	});

	test('uses the current trip day instead of a stored preference', async (): Promise<void> => {
		const name = databaseName();
		const database = await openClientDatabase(name);
		await database.put('meta', { key: 'selectedDay', value: { dayIndex: 12 } });
		database.close();
		const controller = state({
			databaseName: name,
			now: () => new Date('2027-06-04T10:00:00.000Z')
		});

		await controller.initialize();

		expect(controller.selectedIndex).toBe(3);
		await controller.close();
	});

	test('restores a preference outside the trip and falls back to day one', async (): Promise<void> => {
		const restoredName = databaseName();
		const database = await openClientDatabase(restoredName);
		await database.put('meta', { key: 'selectedDay', value: { dayIndex: 7 } });
		database.close();
		const restored = state({
			databaseName: restoredName,
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});
		const fallback = state({
			databaseName: databaseName(),
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});

		await restored.initialize();
		await fallback.initialize();

		expect(restored.selectedIndex).toBe(7);
		expect(fallback.selectedIndex).toBe(0);
		await restored.close();
		await fallback.close();
	});

	test('persists manual selection across controllers', async (): Promise<void> => {
		const name = databaseName();
		const first = state({
			databaseName: name,
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});
		await first.initialize();
		await first.select(14);
		await first.close();
		const second = state({
			databaseName: name,
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});

		await second.initialize();

		expect(second.selectedIndex).toBe(14);
		await second.close();
	});

	test('returns to today on app resume only while the trip is active', async (): Promise<void> => {
		let now = new Date('2027-06-06T10:00:00.000Z');
		const controller = state({ databaseName: databaseName(), now: () => now });
		await controller.initialize();
		await controller.select(15);

		await controller.selectToday();

		expect(controller.selectedIndex).toBe(5);
		now = new Date('2026-10-01T10:00:00.000Z');
		await controller.select(12);
		await controller.selectToday();
		expect(controller.selectedIndex).toBe(12);
		expect(controller.todayIndex).toBeUndefined();
		await controller.close();
	});

	test('offers the new day after midnight without changing selection', async (): Promise<void> => {
		let now = new Date('2027-06-01T21:59:00.000Z');
		const controller = state({ databaseName: databaseName(), now: () => now });
		await controller.initialize();
		now = new Date('2027-06-01T22:01:00.000Z');

		controller.refreshToday();

		expect(controller.selectedIndex).toBe(0);
		expect(controller.todayIndex).toBe(1);
		expect(controller.showTodayOffer).toBe(true);
		await controller.goToToday();
		expect(controller.selectedIndex).toBe(1);
		expect(controller.showTodayOffer).toBe(false);
		await controller.close();
	});

	test('uses the selected trip calendar and timezone', async (): Promise<void> => {
		const state = new TripDayState({
			databaseName: databaseName(),
			now: () => new Date('2027-01-01T23:30:00.000Z')
		});
		const days = [
			{
				id: 'day-one',
				index: 0,
				date: '2027-01-01',
				dateLabel: 'Dag 1',
				title: 'Start',
				phase: 'Reise'
			},
			{
				id: 'day-two',
				index: 1,
				date: '2027-01-02',
				dateLabel: 'Dag 2',
				title: 'Videre',
				phase: 'Reise'
			}
		];

		await state.start('test-trip', days, 'Europe/Oslo');

		expect(state.todayIndex).toBe(1);
		expect(state.selectedIndex).toBe(1);
		await state.close();
	});
});
