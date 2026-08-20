import type { IDBPDatabase } from 'idb';
import { SvelteDate } from 'svelte/reactivity';

import { type GjemmekontorDatabase, openClientDatabase } from '$lib/client/database';

import { isTripDayIndex, tripDayIndexAt } from './days';

type TripDayStateOptions = {
	databaseName?: string;
	now?: () => Date;
};

export class TripDayState {
	selectedIndex = $state(0);
	todayIndex = $state<number>();
	showTodayOffer = $state(false);
	initialized = $state(false);

	private readonly databaseName: string | undefined;
	private readonly now: () => Date;
	private databasePromise: Promise<IDBPDatabase<GjemmekontorDatabase>> | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private started = false;

	constructor(options: TripDayStateOptions = {}) {
		this.databaseName = options.databaseName;
		this.now = options.now ?? (() => new SvelteDate());
	}

	private database(): Promise<IDBPDatabase<GjemmekontorDatabase>> {
		if (!this.databasePromise) {
			this.databasePromise = openClientDatabase(this.databaseName);
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
		this.todayIndex = tripDayIndexAt(this.now());
		this.selectedIndex = this.todayIndex ?? (isTripDayIndex(storedIndex) ? storedIndex : 0);
		this.showTodayOffer = false;
		this.initialized = true;
	}

	async select(index: number): Promise<void> {
		if (!isTripDayIndex(index)) {
			return;
		}
		this.selectedIndex = index;
		this.showTodayOffer = false;
		const database = await this.database();
		await database.put('meta', { key: 'selectedDay', value: { dayIndex: index } });
	}

	refreshToday(): void {
		const current = tripDayIndexAt(this.now());
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

	async start(): Promise<void> {
		if (this.started) {
			return;
		}
		this.started = true;
		await this.initialize();
		if (!this.started) {
			return;
		}
		this.timer = setInterval(() => this.refreshToday(), 60_000);
	}

	stop(): void {
		this.started = false;
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
	}
}

export const tripDayState = new TripDayState();
