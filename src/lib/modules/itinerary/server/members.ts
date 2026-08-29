import type Database from 'better-sqlite3';

export type ItineraryMember = {
	id: string;
	name: string;
};

export function listItineraryMembers(db: Database.Database, tripId: string): ItineraryMember[] {
	return db
		.prepare(
			`SELECT p.id, COALESCE(m.trip_label, p.display_name) AS name
			 FROM trip_members m
			 JOIN people p ON p.id = m.person_id
			 WHERE m.trip_id = ? AND m.active = 1
			 ORDER BY m.sort_order, p.display_name COLLATE NOCASE`
		)
		.all(tripId) as ItineraryMember[];
}
