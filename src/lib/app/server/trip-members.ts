import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { z } from 'zod';

import { auditTrip, nowIso } from './trip-settings-internal';

export function addPersonToTrip(
	db: Database.Database,
	tripId: string,
	input: { personId?: string; displayName?: string }
): string {
	return db.transaction((): string => {
		const now = nowIso();
		let personId = input.personId;
		if (!personId) {
			const displayName = z.string().trim().min(1).max(100).parse(input.displayName);
			personId = randomUUID();
			db.prepare(
				`INSERT INTO people
				 (id, display_name, short_name, color, archived_at, created_at, updated_at)
				 VALUES (?, ?, NULL, NULL, NULL, ?, ?)`
			).run(personId, displayName, now, now);
		} else if (!db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) {
			throw new Error('PERSON_NOT_FOUND');
		}
		const next = db
			.prepare(
				`SELECT COALESCE(MAX(sort_order), -1) + 1 AS position
				 FROM trip_members WHERE trip_id = ?`
			)
			.get(tripId) as { position: number };
		db.prepare(
			`INSERT INTO trip_members
			 (trip_id, person_id, active, sort_order, trip_label, joined_at, removed_at)
			 VALUES (?, ?, 1, ?, NULL, ?, NULL)
			 ON CONFLICT(trip_id, person_id) DO UPDATE SET
			 active = 1, removed_at = NULL`
		).run(tripId, personId, next.position, now);
		auditTrip(db, tripId, 'trip.member.added', { personId });
		return personId;
	})();
}

export function removePersonFromTrip(
	db: Database.Database,
	tripId: string,
	personId: string
): void {
	db.transaction((): void => {
		const result = db
			.prepare(
				`UPDATE trip_members SET active = 0, removed_at = ?
				 WHERE trip_id = ? AND person_id = ? AND active = 1`
			)
			.run(nowIso(), tripId, personId);
		if (result.changes !== 1) throw new Error('TRIP_MEMBER_NOT_FOUND');
		auditTrip(db, tripId, 'trip.member.removed', { personId });
	})();
}

export function listPeople(db: Database.Database): Array<{
	id: string;
	displayName: string;
	archived: boolean;
}> {
	return (
		db
			.prepare(
				'SELECT id, display_name, archived_at FROM people ORDER BY display_name COLLATE NOCASE'
			)
			.all() as Array<{ id: string; display_name: string; archived_at: string | null }>
	).map((person) => ({
		id: person.id,
		displayName: person.display_name,
		archived: person.archived_at !== null
	}));
}
