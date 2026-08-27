import type Database from 'better-sqlite3';

import type { TripDay } from '$lib/trip/itinerary';

export function listTripDays(db: Database.Database, tripId: string): TripDay[] {
	return (
		db
			.prepare(
				`SELECT id, position, calendar_date, date_label, title, phase
				 FROM trip_days WHERE trip_id = ? AND active = 1 ORDER BY position`
			)
			.all(tripId) as Array<{
			id: string;
			position: number;
			calendar_date: string;
			date_label: string;
			title: string;
			phase: string;
		}>
	).map((day) => ({
		id: day.id,
		index: day.position,
		date: day.calendar_date,
		dateLabel: day.date_label,
		title: day.title,
		phase: day.phase
	}));
}
