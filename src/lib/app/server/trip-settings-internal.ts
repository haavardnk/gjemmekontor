import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

export function nowIso(): string {
	return new Date().toISOString();
}

export function auditTrip(
	db: Database.Database,
	tripId: string,
	eventType: string,
	metadata: Record<string, unknown> = {}
): void {
	db.prepare(
		`INSERT INTO trip_audit_log
		 (id, trip_id, event_type, actor_session_hash, metadata_json, created_at)
		 VALUES (?, ?, ?, NULL, ?, ?)`
	).run(randomUUID(), tripId, eventType, JSON.stringify(metadata), nowIso());
}
