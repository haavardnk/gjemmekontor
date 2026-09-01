import { randomUUID } from 'node:crypto';

import { hashSync } from '@node-rs/argon2';
import type Database from 'better-sqlite3';
import { z } from 'zod';

import { isModuleId, moduleCatalog, type ModuleId } from '$lib/app/modules/catalog';
import {
	initializeBlankTripShotContent,
	reconcileTripShotContentDays,
	replaceTripShotContent
} from '$lib/modules/shots/server/content';

import {
	moduleConfig,
	type ModuleSettingsInput,
	normalizedModuleInput,
	tripReadiness
} from './trip-module-settings';
import { auditTrip, nowIso } from './trip-settings-internal';

export { activateTrip, archiveTrip, setTripVisibility, unarchiveTrip } from './trip-lifecycle';
export { addPersonToTrip, listPeople, removePersonFromTrip } from './trip-members';
export {
	type MapSettingsInput,
	type ModuleSettingsInput,
	setTripMapConfiguration,
	setTripModules,
	setTripShoppingListConnection,
	type TripReadiness,
	tripReadiness
} from './trip-module-settings';

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		try {
			dateAtUtc(value);
			return true;
		} catch {
			return false;
		}
	});
const timeZone = z
	.string()
	.min(1)
	.max(100)
	.refine((value) => {
		try {
			new Intl.DateTimeFormat('en', { timeZone: value }).format();
			return true;
		} catch {
			return false;
		}
	});

export const tripGeneralSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		destination: z.string().trim().max(200),
		startsOn: isoDate,
		endsOn: isoDate,
		timezone: timeZone,
		welcomeText: z.string().trim().min(1).max(200)
	})
	.strict()
	.refine((value) => value.startsOn <= value.endsOn, {
		message: 'Sluttdato kan ikke være før startdato.',
		path: ['endsOn']
	})
	.refine((value) => datesInRange(value.startsOn, value.endsOn).length <= 3660, {
		message: 'Reisen kan ikke være lengre enn ti år.',
		path: ['endsOn']
	});

export const tripPasswordSchema = z.string().min(8).max(1024);

export type TripGeneralInput = z.infer<typeof tripGeneralSchema>;

export type TripSettings = TripGeneralInput & {
	id: string;
	slug: string;
	status: 'draft' | 'active' | 'completed' | 'archived';
	visibility: 'listed' | 'unlisted' | 'archived';
	hasPassword: boolean;
	people: Array<{
		id: string;
		displayName: string;
		archived: boolean;
		member: boolean;
		sortOrder?: number;
	}>;
	modules: Array<{
		id: ModuleId;
		label: string;
		enabled: boolean;
		position: number;
		config: Record<string, unknown>;
	}>;
};

function parseGeneral(input: TripGeneralInput): TripGeneralInput {
	return tripGeneralSchema.parse({
		name: input.name,
		destination: input.destination,
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		timezone: input.timezone,
		welcomeText: input.welcomeText
	});
}

function dateAtUtc(value: string): Date {
	const date = new Date(`${value}T12:00:00.000Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
		throw new Error('INVALID_TRIP_DATE');
	}
	return date;
}

function datesInRange(startsOn: string, endsOn: string): string[] {
	const current = dateAtUtc(startsOn);
	const end = dateAtUtc(endsOn);
	const result: string[] = [];
	while (current <= end) {
		result.push(current.toISOString().slice(0, 10));
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return result;
}

function defaultDateLabel(value: string): string {
	return new Intl.DateTimeFormat('nb-NO', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	}).format(dateAtUtc(value));
}

function slugBase(name: string): string {
	const slug = name
		.toLocaleLowerCase('nb-NO')
		.replaceAll('æ', 'ae')
		.replaceAll('ø', 'o')
		.replaceAll('å', 'a')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80);
	return slug || 'reise';
}

function availableSlug(db: Database.Database, name: string): string {
	const base = slugBase(name);
	for (let suffix = 1; suffix < 10_000; suffix += 1) {
		const candidate = suffix === 1 ? base : `${base}-${suffix}`;
		if (!db.prepare('SELECT 1 FROM trips WHERE slug = ?').get(candidate)) return candidate;
	}
	throw new Error('TRIP_SLUG_UNAVAILABLE');
}

function reconcileTripDays(
	db: Database.Database,
	tripId: string,
	startsOn: string,
	endsOn: string
): void {
	const now = nowIso();
	const dates = datesInRange(startsOn, endsOn);
	db.prepare('UPDATE trip_days SET active = 0, updated_at = ? WHERE trip_id = ?').run(now, tripId);
	const existing = db.prepare('SELECT id FROM trip_days WHERE trip_id = ? AND calendar_date = ?');
	const activate = db.prepare(
		`UPDATE trip_days SET active = 1, position = ?, updated_at = ?
		 WHERE trip_id = ? AND calendar_date = ?`
	);
	const insert = db.prepare(
		`INSERT INTO trip_days
		 (id, trip_id, position, calendar_date, active, date_label, title, phase,
		  created_at, updated_at)
		 VALUES (?, ?, ?, ?, 1, ?, ?, 'Reise', ?, ?)`
	);
	for (const [position, date] of dates.entries()) {
		if (existing.get(tripId, date)) {
			activate.run(position, now, tripId, date);
		} else {
			insert.run(
				randomUUID(),
				tripId,
				position,
				date,
				defaultDateLabel(date),
				`Dag ${position + 1}`,
				now,
				now
			);
		}
	}
}

export function createTrip(
	db: Database.Database,
	input: TripGeneralInput & {
		password: string;
		memberIds: string[];
		modules: ModuleSettingsInput;
		shots?: { mode: 'blank' | 'standard' } | { mode: 'clone'; sourceTripId: string };
	},
	options: { tripId?: string } = {}
): string {
	const general = parseGeneral(input);
	const password = tripPasswordSchema.parse(input.password);
	const modules = normalizedModuleInput(input.modules);
	if (modules.enabled.length === 0) throw new Error('AT_LEAST_ONE_MODULE_REQUIRED');
	const tripId = options.tripId ? z.uuid().parse(options.tripId) : randomUUID();
	const now = nowIso();

	db.transaction((): void => {
		const people = new Set(
			(db.prepare('SELECT id FROM people').all() as Array<{ id: string }>).map(
				(person) => person.id
			)
		);
		if (new Set(input.memberIds).size !== input.memberIds.length) {
			throw new Error('DUPLICATE_TRIP_MEMBER');
		}
		if (input.memberIds.some((personId) => !people.has(personId))) {
			throw new Error('UNKNOWN_TRIP_MEMBER');
		}
		db.prepare(
			`INSERT INTO trips
			 (id, slug, name, destination, starts_on, ends_on, timezone, locale,
			  status, visibility, welcome_text, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'nb-NO', 'draft', 'listed', ?, ?, ?)`
		).run(
			tripId,
			availableSlug(db, general.name),
			general.name,
			general.destination,
			general.startsOn,
			general.endsOn,
			general.timezone,
			general.welcomeText,
			now,
			now
		);
		db.prepare(
			`INSERT INTO trip_credentials
			 (trip_id, password_hash, credential_version, updated_at) VALUES (?, ?, 1, ?)`
		).run(tripId, hashSync(password), now);
		db.prepare('INSERT INTO trip_revisions (trip_id, revision) VALUES (?, 0)').run(tripId);
		reconcileTripDays(db, tripId, general.startsOn, general.endsOn);

		const insertModule = db.prepare(
			`INSERT INTO trip_modules
			 (trip_id, module_id, enabled, position, config_version, config_json,
			  configured_at, updated_at)
			 VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
		);
		for (const [position, moduleId] of modules.order.entries()) {
			insertModule.run(
				tripId,
				moduleId,
				modules.enabled.includes(moduleId) ? 1 : 0,
				position,
				JSON.stringify(moduleConfig(moduleId, modules)),
				now,
				now
			);
		}
		const insertMember = db.prepare(
			`INSERT INTO trip_members
			 (trip_id, person_id, active, sort_order, trip_label, joined_at, removed_at)
			 VALUES (?, ?, 1, ?, NULL, ?, NULL)`
		);
		for (const [position, personId] of input.memberIds.entries()) {
			insertMember.run(tripId, personId, position, now);
		}
		initializeBlankTripShotContent(db, tripId);
		if (input.shots && input.shots.mode !== 'blank') {
			replaceTripShotContent(db, tripId, input.shots);
		}
		const readiness = tripReadiness(db, tripId);
		if (!readiness.ready) throw new Error(`TRIP_NOT_READY:${readiness.issues.join('|')}`);
		db.prepare("UPDATE trips SET status = 'active' WHERE id = ?").run(tripId);
		auditTrip(db, tripId, 'trip.created');
	})();
	return tripId;
}

export function updateTripGeneral(
	db: Database.Database,
	tripId: string,
	input: TripGeneralInput
): void {
	const general = parseGeneral(input);
	db.transaction((): void => {
		const changed = db
			.prepare(
				`UPDATE trips SET name = ?, destination = ?, starts_on = ?, ends_on = ?,
				 timezone = ?, welcome_text = ?, updated_at = ?
				 WHERE id = ? AND status != 'archived'`
			)
			.run(
				general.name,
				general.destination,
				general.startsOn,
				general.endsOn,
				general.timezone,
				general.welcomeText,
				nowIso(),
				tripId
			);
		if (changed.changes !== 1) throw new Error('TRIP_NOT_FOUND');
		reconcileTripDays(db, tripId, general.startsOn, general.endsOn);
		reconcileTripShotContentDays(db, tripId);
		auditTrip(db, tripId, 'trip.general.updated');
	})();
}

export function setTripPassword(db: Database.Database, tripId: string, password: string): void {
	const validated = tripPasswordSchema.parse(password);
	const now = nowIso();
	db.transaction((): void => {
		const trip = db
			.prepare("SELECT 1 FROM trips WHERE id = ? AND status != 'archived'")
			.get(tripId);
		if (!trip) throw new Error('TRIP_NOT_FOUND');
		db.prepare(
			`INSERT INTO trip_credentials
			 (trip_id, password_hash, credential_version, updated_at) VALUES (?, ?, 1, ?)
			 ON CONFLICT(trip_id) DO UPDATE SET
			 password_hash = excluded.password_hash,
			 credential_version = trip_credentials.credential_version + 1,
			 updated_at = excluded.updated_at`
		).run(tripId, hashSync(validated), now);
		db.prepare('DELETE FROM session_trip_grants WHERE trip_id = ?').run(tripId);
		auditTrip(db, tripId, 'trip.password.updated');
	})();
}

export function getTripSettings(db: Database.Database, tripId: string): TripSettings | undefined {
	const trip = db
		.prepare(
			`SELECT id, slug, name, destination, starts_on, ends_on, timezone, status,
			 visibility, welcome_text,
			 EXISTS(SELECT 1 FROM trip_credentials WHERE trip_id = trips.id) AS has_password
			 FROM trips WHERE id = ?`
		)
		.get(tripId) as
		| {
				id: string;
				slug: string;
				name: string;
				destination: string;
				starts_on: string;
				ends_on: string;
				timezone: string;
				status: TripSettings['status'];
				visibility: TripSettings['visibility'];
				welcome_text: string;
				has_password: number;
		  }
		| undefined;
	if (!trip) return undefined;
	const memberships = db
		.prepare(
			`SELECT p.id, p.display_name, p.archived_at, m.active, m.sort_order
			 FROM people p LEFT JOIN trip_members m
			 ON m.person_id = p.id AND m.trip_id = ?
			 ORDER BY m.active DESC, m.sort_order, p.display_name COLLATE NOCASE`
		)
		.all(tripId) as Array<{
		id: string;
		display_name: string;
		archived_at: string | null;
		active: number | null;
		sort_order: number | null;
	}>;
	const moduleRows = db
		.prepare(
			`SELECT module_id, enabled, position, config_json
			 FROM trip_modules WHERE trip_id = ? ORDER BY position`
		)
		.all(tripId) as Array<{
		module_id: string;
		enabled: number;
		position: number;
		config_json: string;
	}>;
	return {
		id: trip.id,
		slug: trip.slug,
		name: trip.name,
		destination: trip.destination,
		startsOn: trip.starts_on,
		endsOn: trip.ends_on,
		timezone: trip.timezone,
		welcomeText: trip.welcome_text,
		status: trip.status,
		visibility: trip.visibility,
		hasPassword: trip.has_password === 1,
		people: memberships.map((person) => ({
			id: person.id,
			displayName: person.display_name,
			archived: person.archived_at !== null,
			member: person.active === 1,
			...(person.sort_order === null ? {} : { sortOrder: person.sort_order })
		})),
		modules: moduleRows.flatMap((row) => {
			if (!isModuleId(row.module_id)) return [];
			const manifest = moduleCatalog.find((module) => module.id === row.module_id);
			if (!manifest) return [];
			return [
				{
					id: row.module_id,
					label: manifest.label,
					enabled: row.enabled === 1,
					position: row.position,
					config: JSON.parse(row.config_json) as Record<string, unknown>
				}
			];
		})
	};
}
