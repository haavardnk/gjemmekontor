import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, test } from 'vitest';

import { openClientDatabase } from '$lib/client/database';

import { TripDayState } from './day.svelte';
import { dateKeyAt, tripDayIndexAt } from './days';

const databaseNames: string[] = [];

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

describe('trip day selection', (): void => {
	test('uses the calendar date in Zagreb at UTC boundaries', (): void => {
		expect(dateKeyAt(new Date('2026-09-04T22:00:00.000Z'))).toBe('2026-09-05');
		expect(tripDayIndexAt(new Date('2026-09-04T22:00:00.000Z'))).toBe(0);
		expect(tripDayIndexAt(new Date('2026-09-23T21:59:59.000Z'))).toBe(18);
		expect(tripDayIndexAt(new Date('2026-09-23T22:00:00.000Z'))).toBeUndefined();
	});

	test('uses the current trip day instead of a stored preference', async (): Promise<void> => {
		const name = databaseName();
		const database = await openClientDatabase(name);
		await database.put('meta', { key: 'selectedDay', value: { dayIndex: 12 } });
		database.close();
		const state = new TripDayState({
			databaseName: name,
			now: () => new Date('2026-09-08T10:00:00.000Z')
		});

		await state.initialize();

		expect(state.selectedIndex).toBe(3);
		await state.close();
	});

	test('restores a preference outside the trip and falls back to day one', async (): Promise<void> => {
		const restoredName = databaseName();
		const database = await openClientDatabase(restoredName);
		await database.put('meta', { key: 'selectedDay', value: { dayIndex: 7 } });
		database.close();
		const restored = new TripDayState({
			databaseName: restoredName,
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});
		const fallback = new TripDayState({
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
		const first = new TripDayState({
			databaseName: name,
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});
		await first.initialize();
		await first.select(14);
		await first.close();
		const second = new TripDayState({
			databaseName: name,
			now: () => new Date('2026-08-20T10:00:00.000Z')
		});

		await second.initialize();

		expect(second.selectedIndex).toBe(14);
		await second.close();
	});

	test('returns to today on app resume only while the trip is active', async (): Promise<void> => {
		let now = new Date('2026-09-10T10:00:00.000Z');
		const state = new TripDayState({ databaseName: databaseName(), now: () => now });
		await state.initialize();
		await state.select(15);

		await state.selectToday();

		expect(state.selectedIndex).toBe(5);
		now = new Date('2026-10-01T10:00:00.000Z');
		await state.select(12);
		await state.selectToday();
		expect(state.selectedIndex).toBe(12);
		expect(state.todayIndex).toBeUndefined();
		await state.close();
	});

	test('offers the new day after midnight without changing selection', async (): Promise<void> => {
		let now = new Date('2026-09-05T21:59:00.000Z');
		const state = new TripDayState({ databaseName: databaseName(), now: () => now });
		await state.initialize();
		now = new Date('2026-09-05T22:01:00.000Z');

		state.refreshToday();

		expect(state.selectedIndex).toBe(0);
		expect(state.todayIndex).toBe(1);
		expect(state.showTodayOffer).toBe(true);
		await state.goToToday();
		expect(state.selectedIndex).toBe(1);
		expect(state.showTodayOffer).toBe(false);
		await state.close();
	});
});
