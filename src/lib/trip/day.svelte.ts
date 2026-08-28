import type { IDBPDatabase } from 'idb';
import { SvelteDate } from 'svelte/reactivity';

import {
	type GjemmekontorDatabase,
	openClientDatabase,
	tripClientDatabaseName
} from '$lib/client/database';

import type { TripDay } from './itinerary';
import { isTripDayIndex, tripDayIndexAt } from './itinerary';

type TripDayStateOptions = {
	databaseName?: string;
	now?: () => Date;
	days?: readonly TripDay[];
	timeZone?: string;
};

export class TripDayState {
	selectedIndex = $state(0);
	todayIndex = $state<number>();
	showTodayOffer = $state(false);
	initialized = $state(false);

	private readonly databaseNameOverride: string | undefined;
	private readonly now: () => Date;
	private databasePromise: Promise<IDBPDatabase<GjemmekontorDatabase>> | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private started = false;
	private tripId: string | undefined;
	private days: readonly TripDay[];
	private timeZone: string;
	private readonly resumeToday = (): void => {
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
			return;
		}
		void this.selectToday();
	};

	constructor(options: TripDayStateOptions = {}) {
		this.tripId = options.databaseName ? 'test-trip' : undefined;
		this.databaseNameOverride = options.databaseName;
		this.now = options.now ?? (() => new SvelteDate());
		this.days = options.days ?? [];
		this.timeZone = options.timeZone ?? 'UTC';
	}

	private database(): Promise<IDBPDatabase<GjemmekontorDatabase>> {
		if (!this.databasePromise) {
			if (!this.tripId) {
				throw new Error('TRIP_ID_REQUIRED');
			}
			this.databasePromise = openClientDatabase(
				this.databaseNameOverride ?? tripClientDatabaseName(this.tripId)
			);
		}
		return this.databasePromise;
	}

	async initialize(): Promise<void> {
		const database = await this.database();
		const stored = await database.get('meta', 'selectedDay');
		const storedIndex =
			stored?.value && typeof stored.value === 'object' && !Array.isArray(stored.value)
				? stored.value.dayIndex
				: undefined;
		this.todayIndex = tripDayIndexAt(this.now(), this.days, this.timeZone);
		this.selectedIndex =
			this.todayIndex ?? (isTripDayIndex(storedIndex, this.days.length) ? storedIndex : 0);
		this.showTodayOffer = false;
		this.initialized = true;
	}

	async select(index: number): Promise<void> {
		if (!isTripDayIndex(index, this.days.length)) {
			return;
		}
		this.selectedIndex = index;
		this.showTodayOffer = false;
		const database = await this.database();
		await database.put('meta', { key: 'selectedDay', value: { dayIndex: index } });
	}

	refreshToday(): void {
		const current = tripDayIndexAt(this.now(), this.days, this.timeZone);
		if (current === this.todayIndex) {
			return;
		}
		this.todayIndex = current;
		this.showTodayOffer = current !== undefined && current !== this.selectedIndex;
	}

	async goToToday(): Promise<void> {
		if (this.todayIndex === undefined) {
			return;
		}
		await this.select(this.todayIndex);
	}

	async selectToday(): Promise<void> {
		const current = tripDayIndexAt(this.now(), this.days, this.timeZone);
		this.todayIndex = current;
		if (current !== undefined && current !== this.selectedIndex) {
			await this.select(current);
		}
	}

	async start(tripId: string, days: readonly TripDay[], timeZone: string): Promise<void> {
		if (
			this.started &&
			this.tripId === tripId &&
			this.days === days &&
			this.timeZone === timeZone
		) {
			return;
		}
		if (this.tripId && this.tripId !== tripId) {
			await this.close();
			this.selectedIndex = 0;
			this.todayIndex = undefined;
			this.showTodayOffer = false;
			this.initialized = false;
		}
		this.tripId = tripId;
		this.days = days;
		this.timeZone = timeZone;
		this.started = true;
		await this.initialize();
		if (!this.started) {
			return;
		}
		if (typeof window !== 'undefined') {
			window.addEventListener('focus', this.resumeToday);
		}
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.resumeToday);
		}
		this.timer = setInterval(() => this.refreshToday(), 60_000);
	}

	stop(): void {
		this.started = false;
		if (typeof window !== 'undefined') {
			window.removeEventListener('focus', this.resumeToday);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.resumeToday);
		}
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	async close(): Promise<void> {
		this.stop();
		if (this.databasePromise) {
			const database = await this.databasePromise;
			database.close();
			this.databasePromise = undefined;
		}
		this.tripId = undefined;
	}
}

export const tripDayState = new TripDayState();
