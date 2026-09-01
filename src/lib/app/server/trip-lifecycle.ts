import type Database from 'better-sqlite3';

import { type TripReadiness, tripReadiness } from './trip-module-settings';
import { auditTrip, nowIso } from './trip-settings-internal';

export function activateTrip(db: Database.Database, tripId: string): TripReadiness {
	return db.transaction((): TripReadiness => {
		const readiness = tripReadiness(db, tripId);
		if (!readiness.ready) return readiness;
		db.prepare("UPDATE trips SET status = 'active', updated_at = ? WHERE id = ?").run(
			nowIso(),
			tripId
		);
		auditTrip(db, tripId, 'trip.activated');
		return readiness;
	})();
}

export function setTripVisibility(
	db: Database.Database,
	tripId: string,
	visibility: 'listed' | 'unlisted'
): void {
	db.transaction((): void => {
		const result = db
			.prepare(
				"UPDATE trips SET visibility = ?, updated_at = ? WHERE id = ? AND status != 'archived'"
			)
			.run(visibility, nowIso(), tripId);
		if (result.changes !== 1) throw new Error('TRIP_NOT_FOUND');
		auditTrip(db, tripId, 'trip.visibility.updated', { visibility });
	})();
}

export function archiveTrip(db: Database.Database, tripId: string): void {
	db.transaction((): void => {
		const result = db
			.prepare(
				"UPDATE trips SET status = 'archived', visibility = 'archived', updated_at = ? WHERE id = ?"
			)
			.run(nowIso(), tripId);
		if (result.changes !== 1) throw new Error('TRIP_NOT_FOUND');
		db.prepare('DELETE FROM session_trip_grants WHERE trip_id = ?').run(tripId);
		auditTrip(db, tripId, 'trip.archived');
	})();
}

export function unarchiveTrip(db: Database.Database, tripId: string): TripReadiness {
	return db.transaction((): TripReadiness => {
		const trip = db.prepare("SELECT 1 FROM trips WHERE id = ? AND status = 'archived'").get(tripId);
		if (!trip) throw new Error('TRIP_NOT_ARCHIVED');
		const readiness = tripReadiness(db, tripId);
		db.prepare('UPDATE trips SET status = ?, visibility = ?, updated_at = ? WHERE id = ?').run(
			readiness.ready ? 'active' : 'draft',
			'listed',
			nowIso(),
			tripId
		);
		auditTrip(db, tripId, 'trip.unarchived');
		return readiness;
	})();
}
