import { randomUUID } from 'node:crypto';

import { hashSync } from '@node-rs/argon2';
import type Database from 'better-sqlite3';
import { z } from 'zod';

import { isModuleId, moduleCatalog, type ModuleId } from '$lib/app/modules/catalog';
import type { MapMode } from '$lib/modules/map/domain/types';
import {
	type MapOverlay,
	mapOverlayValues,
	parseMapRuntimeConfig
} from '$lib/modules/map/server/config';

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

export type ModuleSettingsInput = {
	order: ModuleId[];
	enabled: ModuleId[];
	mapGoogleMyMapsId: string;
	mapDefaultMode: MapMode;
	mapEnabledOverlays: MapOverlay[];
	mapOfflinePackages: MapMode[];
	shoppingListUuid: string;
};

export type MapSettingsInput = Pick<
	ModuleSettingsInput,
	'mapGoogleMyMapsId' | 'mapDefaultMode' | 'mapEnabledOverlays' | 'mapOfflinePackages'
>;

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

export type TripReadiness = {
	ready: boolean;
	issues: string[];
};

function nowIso(): string {
	return new Date().toISOString();
}

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

function audit(
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

function parseModuleOrder(value: readonly string[]): ModuleId[] {
	if (value.length !== moduleCatalog.length || new Set(value).size !== moduleCatalog.length) {
		throw new Error('INVALID_MODULE_ORDER');
	}
	if (!value.every(isModuleId) || moduleCatalog.some((module) => !value.includes(module.id))) {
		throw new Error('INVALID_MODULE_ORDER');
	}
	return [...value] as ModuleId[];
}

function normalizedModuleInput(input: ModuleSettingsInput): ModuleSettingsInput {
	const order = parseModuleOrder(input.order);
	const enabled = input.enabled.filter(isModuleId);
	if (new Set(enabled).size !== enabled.length) throw new Error('INVALID_ENABLED_MODULES');
	const mapDefaultMode = z.enum(['normal', 'nautical', 'satellite']).parse(input.mapDefaultMode);
	const mapEnabledOverlays = z.array(z.enum(mapOverlayValues)).parse(input.mapEnabledOverlays);
	const mapOfflinePackages = z
		.array(z.enum(['normal', 'nautical', 'satellite']))
		.parse(input.mapOfflinePackages);
	if (
		new Set(mapEnabledOverlays).size !== mapEnabledOverlays.length ||
		new Set(mapOfflinePackages).size !== mapOfflinePackages.length
	) {
		throw new Error('INVALID_MAP_CONFIGURATION');
	}
	return {
		order,
		enabled,
		mapGoogleMyMapsId: input.mapGoogleMyMapsId.trim(),
		mapDefaultMode,
		mapEnabledOverlays,
		mapOfflinePackages,
		shoppingListUuid: input.shoppingListUuid.trim()
	};
}

function moduleConfig(moduleId: ModuleId, input: ModuleSettingsInput): Record<string, unknown> {
	if (moduleId === 'map') {
		return {
			...(input.mapGoogleMyMapsId ? { googleMyMapsId: input.mapGoogleMyMapsId } : {}),
			defaultMode: input.mapDefaultMode,
			enabledOverlays: input.mapEnabledOverlays,
			offlinePackages: input.mapOfflinePackages
		};
	}
	if (moduleId === 'shopping-list') {
		return input.shoppingListUuid ? { listUuid: input.shoppingListUuid } : {};
	}
	return {};
}

export function tripReadiness(db: Database.Database, tripId: string): TripReadiness {
	const issues: string[] = [];
	const trip = db.prepare('SELECT starts_on, ends_on FROM trips WHERE id = ?').get(tripId) as
		{ starts_on: string | null; ends_on: string | null } | undefined;
	if (!trip) throw new Error('TRIP_NOT_FOUND');
	if (!trip.starts_on || !trip.ends_on) issues.push('Angi fra- og til-dato.');
	if (!db.prepare('SELECT 1 FROM trip_credentials WHERE trip_id = ?').get(tripId)) {
		issues.push('Angi et reisepassord.');
	}
	const modules = db
		.prepare(
			`SELECT module_id, config_json FROM trip_modules
			 WHERE trip_id = ? AND enabled = 1 ORDER BY position`
		)
		.all(tripId) as Array<{ module_id: string; config_json: string }>;
	if (modules.length === 0) issues.push('Aktiver minst én modul.');
	for (const module of modules) {
		const config = JSON.parse(module.config_json) as Record<string, unknown>;
		if (module.module_id === 'map' && !config.googleMyMapsId) {
			issues.push('Kart trenger en Google My Maps-ID.');
		}
		if (
			module.module_id === 'map' &&
			Array.isArray(config.enabledOverlays) &&
			config.enabledOverlays.includes('ais') &&
			!parseMapRuntimeConfig(process.env, '.').aisStreamApiKey
		) {
			issues.push('AIS-overlegget trenger AISSTREAM_API_KEY.');
		}
		if (module.module_id === 'shopping-list' && !config.listUuid) {
			issues.push('Handleliste trenger en Bring-liste-ID.');
		}
	}
	return { ready: issues.length === 0, issues };
}

export function createTrip(
	db: Database.Database,
	input: TripGeneralInput & {
		password: string;
		memberIds: string[];
		modules: ModuleSettingsInput;
	}
): string {
	const general = parseGeneral(input);
	const password = tripPasswordSchema.parse(input.password);
	const modules = normalizedModuleInput(input.modules);
	if (modules.enabled.length === 0) throw new Error('AT_LEAST_ONE_MODULE_REQUIRED');
	const tripId = randomUUID();
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
		const readiness = tripReadiness(db, tripId);
		if (!readiness.ready) throw new Error(`TRIP_NOT_READY:${readiness.issues.join('|')}`);
		db.prepare("UPDATE trips SET status = 'active' WHERE id = ?").run(tripId);
		audit(db, tripId, 'trip.created');
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
		audit(db, tripId, 'trip.general.updated');
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
		audit(db, tripId, 'trip.password.updated');
	})();
}

export function setTripModules(
	db: Database.Database,
	tripId: string,
	input: ModuleSettingsInput
): void {
	const modules = normalizedModuleInput(input);
	const now = nowIso();
	db.transaction((): void => {
		const existing = db
			.prepare(
				`SELECT module_id, enabled, config_version, config_json, configured_at
				 FROM trip_modules WHERE trip_id = ?`
			)
			.all(tripId) as Array<{
			module_id: ModuleId;
			enabled: number;
			config_version: number;
			config_json: string;
			configured_at: string;
		}>;
		if (existing.length !== moduleCatalog.length) throw new Error('TRIP_MODULES_INCOMPLETE');
		const byId = new Map(existing.map((module) => [module.module_id, module]));
		db.prepare('UPDATE trip_modules SET position = position + 10000 WHERE trip_id = ?').run(tripId);
		const update = db.prepare(
			`UPDATE trip_modules SET enabled = ?, position = ?, config_version = ?,
			 config_json = ?, configured_at = ?, updated_at = ?
			 WHERE trip_id = ? AND module_id = ?`
		);
		const insertHistory = db.prepare(
			`INSERT INTO trip_module_config_history
			 (id, trip_id, module_id, config_version, config_json, changed_at, changed_by_session)
			 VALUES (?, ?, ?, ?, ?, ?, NULL)`
		);
		for (const [position, moduleId] of modules.order.entries()) {
			const previous = byId.get(moduleId);
			if (!previous) throw new Error('TRIP_MODULES_INCOMPLETE');
			const configJson = JSON.stringify(moduleConfig(moduleId, modules));
			const configChanged = configJson !== previous.config_json;
			const configVersion = previous.config_version + (configChanged ? 1 : 0);
			update.run(
				modules.enabled.includes(moduleId) ? 1 : 0,
				position,
				configVersion,
				configJson,
				configChanged ? now : previous.configured_at,
				now,
				tripId,
				moduleId
			);
			if (configChanged) {
				insertHistory.run(randomUUID(), tripId, moduleId, configVersion, configJson, now);
			}
		}
		if (!tripReadiness(db, tripId).ready) {
			db.prepare("UPDATE trips SET status = 'draft', updated_at = ? WHERE id = ?").run(now, tripId);
			db.prepare('DELETE FROM session_trip_grants WHERE trip_id = ?').run(tripId);
		}
		audit(db, tripId, 'trip.modules.updated', { order: modules.order, enabled: modules.enabled });
	})();
}

export function setTripMapConfiguration(
	db: Database.Database,
	tripId: string,
	input: MapSettingsInput
): void {
	const mapGoogleMyMapsId = input.mapGoogleMyMapsId.trim();
	const mapDefaultMode = z.enum(['normal', 'nautical', 'satellite']).parse(input.mapDefaultMode);
	const mapEnabledOverlays = z.array(z.enum(mapOverlayValues)).parse(input.mapEnabledOverlays);
	const mapOfflinePackages = z
		.array(z.enum(['normal', 'nautical', 'satellite']))
		.parse(input.mapOfflinePackages);
	if (
		new Set(mapEnabledOverlays).size !== mapEnabledOverlays.length ||
		new Set(mapOfflinePackages).size !== mapOfflinePackages.length
	) {
		throw new Error('INVALID_MAP_CONFIGURATION');
	}
	const configJson = JSON.stringify({
		...(mapGoogleMyMapsId ? { googleMyMapsId: mapGoogleMyMapsId } : {}),
		defaultMode: mapDefaultMode,
		enabledOverlays: mapEnabledOverlays,
		offlinePackages: mapOfflinePackages
	});
	const now = nowIso();
	db.transaction((): void => {
		const current = db
			.prepare(
				`SELECT config_version, config_json FROM trip_modules
				 WHERE trip_id = ? AND module_id = 'map'`
			)
			.get(tripId) as { config_version: number; config_json: string } | undefined;
		if (!current) throw new Error('TRIP_NOT_FOUND');
		if (current.config_json === configJson) return;
		const version = current.config_version + 1;
		db.prepare(
			`UPDATE trip_modules SET config_version = ?, config_json = ?, configured_at = ?, updated_at = ?
			 WHERE trip_id = ? AND module_id = 'map'`
		).run(version, configJson, now, now, tripId);
		db.prepare(
			`INSERT INTO trip_module_config_history
			 (id, trip_id, module_id, config_version, config_json, changed_at, changed_by_session)
			 VALUES (?, ?, 'map', ?, ?, ?, NULL)`
		).run(randomUUID(), tripId, version, configJson, now);
		if (!tripReadiness(db, tripId).ready) {
			db.prepare("UPDATE trips SET status = 'draft', updated_at = ? WHERE id = ?").run(now, tripId);
			db.prepare('DELETE FROM session_trip_grants WHERE trip_id = ?').run(tripId);
		}
		audit(db, tripId, 'trip.map.updated');
	})();
}
export function activateTrip(db: Database.Database, tripId: string): TripReadiness {
	return db.transaction((): TripReadiness => {
		const readiness = tripReadiness(db, tripId);
		if (!readiness.ready) return readiness;
		db.prepare("UPDATE trips SET status = 'active', updated_at = ? WHERE id = ?").run(
			nowIso(),
			tripId
		);
		audit(db, tripId, 'trip.activated');
		return readiness;
	})();
}

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
		audit(db, tripId, 'trip.member.added', { personId });
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
		audit(db, tripId, 'trip.member.removed', { personId });
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
		audit(db, tripId, 'trip.visibility.updated', { visibility });
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
		audit(db, tripId, 'trip.archived');
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
		audit(db, tripId, 'trip.unarchived');
		return readiness;
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
