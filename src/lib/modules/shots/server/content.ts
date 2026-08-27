import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { listTripDays } from '$lib/app/server/trip-days';
import type { TripDay } from '$lib/trip/itinerary';

import {
	blankShotContent,
	type ShotContent,
	shotContentSchema,
	standardShotContent
} from '../domain/pack';

type PackRow = {
	id: string;
	name: string;
	version: number;
	content_json: string;
};

function nowIso(): string {
	return new Date().toISOString();
}

function activePack(db: Database.Database, tripId: string): PackRow | undefined {
	return db
		.prepare(
			`SELECT p.id, p.name, p.version, p.content_json
			 FROM trip_shot_content t JOIN shot_content_packs p ON p.id = t.content_pack_id
			 WHERE t.trip_id = ?`
		)
		.get(tripId) as PackRow | undefined;
}

function alignDayPlans(content: ShotContent, days: readonly TripDay[]): ShotContent {
	const byIndex = new Map(content.dayPlans.map((plan) => [plan.dayIndex, plan]));
	return {
		...content,
		dayPlans: days.map(
			(day) =>
				byIndex.get(day.index) ?? {
					dayIndex: day.index,
					modules: [],
					core: 'travel',
					flexible: false
				}
		)
	};
}

function hasExactDays(content: ShotContent, days: readonly TripDay[]): boolean {
	return (
		content.dayPlans.length === days.length &&
		content.dayPlans.every((plan, index) => plan.dayIndex === days[index]?.index)
	);
}

export function loadTripShotContent(
	db: Database.Database,
	tripId: string
): { packId?: string; name: string; version: number; content: ShotContent } {
	const pack = activePack(db, tripId);
	if (!pack) {
		return {
			name: 'Tom opptaksplan',
			version: 1,
			content: blankShotContent(listTripDays(db, tripId))
		};
	}
	return {
		packId: pack.id,
		name: pack.name,
		version: pack.version,
		content: shotContentSchema.parse(JSON.parse(pack.content_json))
	};
}

function insertPack(
	db: Database.Database,
	tripId: string,
	name: string,
	version: number,
	content: ShotContent
): string {
	const id = randomUUID();
	const now = nowIso();
	db.prepare(
		`INSERT INTO shot_content_packs
		 (id, owner_trip_id, name, version, content_json, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(id, tripId, name, version, JSON.stringify(shotContentSchema.parse(content)), now, now);
	db.prepare(
		`INSERT INTO trip_shot_content (trip_id, content_pack_id) VALUES (?, ?)
		 ON CONFLICT(trip_id) DO UPDATE SET content_pack_id = excluded.content_pack_id`
	).run(tripId, id);
	db.prepare(
		`INSERT INTO trip_audit_log
		 (id, trip_id, event_type, actor_session_hash, metadata_json, created_at)
		 VALUES (?, ?, 'trip.shots.content.updated', NULL, ?, ?)`
	).run(id, tripId, JSON.stringify({ packId: id, name, version }), now);
	return id;
}

export function initializeBlankTripShotContent(db: Database.Database, tripId: string): string {
	const trip = db.prepare('SELECT name FROM trips WHERE id = ?').get(tripId) as
		{ name: string } | undefined;
	if (!trip) throw new Error('TRIP_NOT_FOUND');
	const existing = activePack(db, tripId);
	if (existing) return existing.id;
	return insertPack(
		db,
		tripId,
		`${trip.name} · tom opptaksplan`,
		1,
		blankShotContent(listTripDays(db, tripId))
	);
}

export function replaceTripShotContent(
	db: Database.Database,
	tripId: string,
	input:
		| { mode: 'blank' | 'standard' }
		| { mode: 'clone'; sourceTripId: string }
		| { mode: 'custom'; content: unknown }
): string {
	return db.transaction((): string => {
		const trip = db.prepare('SELECT name FROM trips WHERE id = ?').get(tripId) as
			{ name: string } | undefined;
		if (!trip) throw new Error('TRIP_NOT_FOUND');
		const current = activePack(db, tripId);
		const nextVersion = (current?.version ?? 0) + 1;
		if (input.mode === 'clone') {
			if (input.sourceTripId === tripId) throw new Error('SHOT_CLONE_SOURCE_INVALID');
			const source = activePack(db, input.sourceTripId);
			if (!source) throw new Error('SHOT_CLONE_SOURCE_NOT_FOUND');
			const content = alignDayPlans(
				shotContentSchema.parse(JSON.parse(source.content_json)),
				listTripDays(db, tripId)
			);
			return insertPack(db, tripId, `${trip.name} · kopi av ${source.name}`, nextVersion, content);
		}
		const days = listTripDays(db, tripId);
		const parsedContent =
			input.mode === 'custom'
				? shotContentSchema.parse(input.content)
				: input.mode === 'standard'
					? standardShotContent(days)
					: blankShotContent(days);
		if (input.mode === 'custom' && !hasExactDays(parsedContent, days)) {
			throw new Error('SHOT_CONTENT_DAYS_INVALID');
		}
		return insertPack(
			db,
			tripId,
			`${trip.name} · ${input.mode === 'blank' ? 'tom opptaksplan' : input.mode === 'standard' ? 'standardmal' : 'egen opptaksplan'}`,
			nextVersion,
			parsedContent
		);
	})();
}

export function reconcileTripShotContentDays(db: Database.Database, tripId: string): void {
	const current = activePack(db, tripId);
	if (!current) return;
	const content = shotContentSchema.parse(JSON.parse(current.content_json));
	const days = listTripDays(db, tripId);
	if (hasExactDays(content, days)) return;
	insertPack(db, tripId, current.name, current.version + 1, alignDayPlans(content, days));
}

export function listShotCloneSources(
	db: Database.Database,
	tripId = ''
): Array<{ tripId: string; tripName: string; packName: string; version: number }> {
	return db
		.prepare(
			`SELECT t.id AS trip_id, t.name AS trip_name, p.name AS pack_name, p.version
			 FROM trips t JOIN trip_shot_content c ON c.trip_id = t.id
			 JOIN shot_content_packs p ON p.id = c.content_pack_id
			 WHERE t.id != ? ORDER BY t.name COLLATE NOCASE`
		)
		.all(tripId)
		.map((row) => {
			const value = row as {
				trip_id: string;
				trip_name: string;
				pack_name: string;
				version: number;
			};
			return {
				tripId: value.trip_id,
				tripName: value.trip_name,
				packName: value.pack_name,
				version: value.version
			};
		});
}
