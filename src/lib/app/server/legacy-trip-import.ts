import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import { moduleCatalog } from '$lib/app/modules/catalog';
import { gearCategorySchema, gearItemSchema, gearOwnerSchema } from '$lib/modules/gear/domain/gear';
import { menuActiveSchema, menuArchiveSchema } from '$lib/modules/menu/domain/menu';
import { ruleBookGameSchema } from '$lib/modules/rule-book/domain/rule-book';
import {
	activityModuleIds,
	backupChecks,
	scenarioGroups,
	shotModules
} from '$lib/modules/shots/domain/content';
import { shotsDayPlan } from '$lib/modules/shots/domain/day-plan';
import { cameraChoices } from '$lib/modules/shots/domain/digest';
import { tripDays, tripTimeZone } from '$lib/trip/itinerary';

export const kroatia2026TripId = '82a8d607-acc9-4c50-a948-463e6a34ef25';
export const kroatia2026Slug = 'kroatia-2026';
export const kroatia2026Name = 'Kroatia 2026';
export const kroatia2026WelcomeText = 'Velkommen om bord på S/Y Bad Buoy';

const knownPeople = ['Håvard', 'Tina', 'Tomine', 'Odd', 'Lise', 'Oskar'] as const;
const importMarker = 'migration:trip-based-v0.2.0';

type StateRow = {
	key: string;
	value: string;
	revision: number;
	client_id: string;
	mutation_id: string;
	updated_at: string;
};

export type LegacyTripImportOptions = {
	now?: Date;
};

export type LegacyTripImportReport = {
	tripId: string;
	stateEntries: number;
	mutationReceipts: number;
	people: number;
	recipes: number;
	menuEntries: number;
	gearCategories: number;
	gearItems: number;
	gpxUploads: number;
	gpxBytes: number;
	mapMappings: number;
	mapEnrichments: number;
};

type PersonCandidate = {
	id: string;
	name: string;
	createdAt: string;
};

function stableUuid(scope: string, value: string): string {
	const bytes = createHash('sha256').update(`${scope}\0${value}`).digest().subarray(0, 16);
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizedName(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

function stateRows(db: Database.Database): StateRow[] {
	return db
		.prepare(
			`SELECT key, value, revision, client_id, mutation_id, updated_at
			 FROM state_entries ORDER BY revision`
		)
		.all() as StateRow[];
}

function stateValue(rows: readonly StateRow[], key: string): unknown {
	const row = rows.find((candidate) => candidate.key === key);
	return row ? (JSON.parse(row.value) as unknown) : undefined;
}

function globalRevision(db: Database.Database): number {
	const row = db.prepare("SELECT value FROM meta WHERE key = 'global_revision'").get() as
		{ value: string } | undefined;
	const revision = Number(row?.value);
	if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('INVALID_GLOBAL_REVISION');
	return revision;
}

function tableCount(db: Database.Database, table: string): number {
	const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
	return row.count;
}

function importPeople(
	db: Database.Database,
	rows: readonly StateRow[],
	now: string
): Map<string, string> {
	const peopleByName = new Map<string, PersonCandidate>();
	const legacyOwnerIds = new Map<string, string>();
	const game = ruleBookGameSchema.safeParse(stateValue(rows, 'rule-book:game'));
	const participants = game.success
		? game.data.status === 'active'
			? game.data.participantOrder
			: game.data.participants
		: [];

	const addPerson = (candidate: PersonCandidate): PersonCandidate => {
		const key = normalizedName(candidate.name);
		const existing = peopleByName.get(key);
		if (existing && existing.id !== candidate.id) return existing;
		peopleByName.set(key, candidate);
		return candidate;
	};

	for (const participant of participants) {
		addPerson({ id: participant.id, name: participant.name, createdAt: now });
	}

	for (const name of knownPeople) {
		if (!peopleByName.has(normalizedName(name))) {
			addPerson({
				id: stableUuid('kroatia-2026-person', normalizedName(name)),
				name,
				createdAt: now
			});
		}
	}

	for (const row of rows.filter((candidate) => candidate.key.startsWith('gear:owner:'))) {
		const parsed = gearOwnerSchema.safeParse(JSON.parse(row.value));
		if (!parsed.success || row.key !== `gear:owner:${parsed.data.id}`) {
			throw new Error(`INVALID_GEAR_OWNER:${row.key}`);
		}
		const person =
			peopleByName.get(normalizedName(parsed.data.name)) ??
			addPerson({
				id: parsed.data.id,
				name: parsed.data.name,
				createdAt: parsed.data.createdAt
			});
		legacyOwnerIds.set(parsed.data.id, person.id);
	}

	const insertPerson = db.prepare(`
		INSERT INTO people
		(id, display_name, short_name, color, archived_at, created_at, updated_at)
		VALUES (?, ?, NULL, NULL, NULL, ?, ?)
	`);
	const insertMember = db.prepare(`
		INSERT INTO trip_members
		(trip_id, person_id, active, sort_order, trip_label, joined_at, removed_at)
		VALUES (?, ?, 1, ?, NULL, ?, NULL)
	`);
	const participantIds = new Set(participants.map((participant) => participant.id));
	const insertOptOut = db.prepare(`
		INSERT INTO trip_member_module_preferences
		(trip_id, person_id, module_id, opted_out, updated_at)
		VALUES (?, ?, 'rule-book', 1, ?)
	`);

	for (const [index, person] of [...peopleByName.values()].entries()) {
		insertPerson.run(person.id, person.name, person.createdAt, now);
		insertMember.run(kroatia2026TripId, person.id, index, now);
		if (game.success && !participantIds.has(person.id)) {
			insertOptOut.run(kroatia2026TripId, person.id, now);
		}
	}

	return legacyOwnerIds;
}

function importMenu(db: Database.Database, rows: readonly StateRow[]): void {
	const archives = new Map<string, { versionId: string; value: string }>();
	const insertRecipe = db.prepare(`
		INSERT INTO recipes (id, name, archived_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`);
	const insertVersion = db.prepare(`
		INSERT INTO recipe_versions
		(id, recipe_id, version, value, created_by_person_id, created_at)
		VALUES (?, ?, 1, ?, NULL, ?)
	`);

	for (const row of rows.filter((candidate) => candidate.key.startsWith('menu:archive:'))) {
		const parsed = menuArchiveSchema.safeParse(JSON.parse(row.value));
		if (!parsed.success || row.key !== `menu:archive:${parsed.data.id}`) {
			throw new Error(`INVALID_MENU_ARCHIVE:${row.key}`);
		}
		const versionId = stableUuid('recipe-version', `${parsed.data.id}:1`);
		insertRecipe.run(
			parsed.data.id,
			parsed.data.name,
			parsed.data.tombstone ? row.updated_at : null,
			parsed.data.createdAt,
			row.updated_at
		);
		insertVersion.run(versionId, parsed.data.id, row.value, parsed.data.createdAt);
		archives.set(parsed.data.id, { versionId, value: row.value });
	}

	const insertEntry = db.prepare(`
		INSERT INTO trip_menu_entries
		(id, trip_id, recipe_id, recipe_version_id, value, active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const row of rows.filter((candidate) => candidate.key.startsWith('menu:active:'))) {
		const parsed = menuActiveSchema.safeParse(JSON.parse(row.value));
		if (!parsed.success || row.key !== `menu:active:${parsed.data.archiveId}`) {
			throw new Error(`INVALID_MENU_ACTIVE:${row.key}`);
		}
		const archive = archives.get(parsed.data.archiveId);
		if (!archive) throw new Error(`MISSING_MENU_ARCHIVE:${parsed.data.archiveId}`);
		insertEntry.run(
			stableUuid('trip-menu-entry', `${kroatia2026TripId}:${parsed.data.archiveId}`),
			kroatia2026TripId,
			parsed.data.archiveId,
			archive.versionId,
			row.value,
			parsed.data.tombstone ? 0 : 1,
			parsed.data.activatedAt,
			row.updated_at
		);
	}
}

function importGear(
	db: Database.Database,
	rows: readonly StateRow[],
	legacyOwnerIds: ReadonlyMap<string, string>
): void {
	const categories = new Set<string>();
	const insertCategory = db.prepare(`
		INSERT INTO gear_categories
		(id, name, sort_order, archived_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
	for (const row of rows.filter((candidate) => candidate.key.startsWith('gear:category:'))) {
		const parsed = gearCategorySchema.safeParse(JSON.parse(row.value));
		if (!parsed.success || row.key !== `gear:category:${parsed.data.id}`) {
			throw new Error(`INVALID_GEAR_CATEGORY:${row.key}`);
		}
		insertCategory.run(
			parsed.data.id,
			parsed.data.name,
			parsed.data.position,
			parsed.data.tombstone ? row.updated_at : null,
			parsed.data.createdAt,
			row.updated_at
		);
		categories.add(parsed.data.id);
	}

	const insertItem = db.prepare(`
		INSERT INTO gear_items
		(id, name, category_id, default_quantity, default_notes, lifecycle_status,
		 archived_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	const insertOwner = db.prepare(`
		INSERT INTO gear_item_owners (gear_item_id, person_id, ownership_role)
		VALUES (?, ?, 'owner')
	`);
	const insertTripItem = db.prepare(`
		INSERT INTO trip_gear_items
		(trip_id, gear_item_id, quantity_override, availability, trip_notes, active,
		 added_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);
	const insertPacking = db.prepare(`
		INSERT INTO trip_gear_packing
		(trip_id, gear_item_id, packed, packed_at, packed_by_person_id)
		VALUES (?, ?, ?, ?, NULL)
	`);

	for (const row of rows.filter((candidate) => candidate.key.startsWith('gear:item:'))) {
		const parsed = gearItemSchema.safeParse(JSON.parse(row.value));
		if (!parsed.success || row.key !== `gear:item:${parsed.data.id}`) {
			throw new Error(`INVALID_GEAR_ITEM:${row.key}`);
		}
		if (!categories.has(parsed.data.categoryId)) {
			throw new Error(`MISSING_GEAR_CATEGORY:${parsed.data.categoryId}`);
		}
		insertItem.run(
			parsed.data.id,
			parsed.data.name,
			parsed.data.categoryId,
			parsed.data.quantity,
			parsed.data.notes,
			parsed.data.tombstone ? 'retired' : 'available',
			parsed.data.tombstone ? row.updated_at : null,
			parsed.data.createdAt,
			row.updated_at
		);
		if (parsed.data.ownerId) {
			const personId = legacyOwnerIds.get(parsed.data.ownerId);
			if (!personId) throw new Error(`MISSING_GEAR_OWNER:${parsed.data.ownerId}`);
			insertOwner.run(parsed.data.id, personId);
		}
		const planned = stateValue(rows, `gear:planned:${parsed.data.id}`) !== false;
		insertTripItem.run(
			kroatia2026TripId,
			parsed.data.id,
			parsed.data.quantity,
			parsed.data.availability,
			parsed.data.notes,
			planned && !parsed.data.tombstone ? 1 : 0,
			parsed.data.createdAt,
			row.updated_at
		);
		const packed = stateValue(rows, `gear:packed:${parsed.data.id}`);
		if (typeof packed === 'boolean') {
			insertPacking.run(
				kroatia2026TripId,
				parsed.data.id,
				packed ? 1 : 0,
				packed ? row.updated_at : null
			);
		}
	}
}

function importServerModuleData(db: Database.Database): void {
	const legacyGpx = db.prepare('SELECT * FROM gpx_uploads ORDER BY id').all() as Array<{
		id: string;
		leg_key: string;
		filename: string;
		content_type: string;
		checksum: string;
		byte_size: number;
		parser_version: number;
		extraction: string;
		original: Buffer;
		client_id: string;
		created_at: string;
	}>;
	const tripDay = db.prepare(
		'SELECT id FROM trip_days WHERE trip_id = ? AND position = ? AND active = 1'
	);
	const insertGpx = db.prepare(
		`INSERT INTO trip_gpx_uploads
		 (id, trip_id, trip_day_id, leg_key, filename, content_type, checksum, byte_size,
		  parser_version, extraction, original, client_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	for (const gpx of legacyGpx) {
		const dayIndex = Number(gpx.leg_key.match(/^logbook:d(\d+):leg:/)?.[1]);
		const day = Number.isInteger(dayIndex)
			? (tripDay.get(kroatia2026TripId, dayIndex) as { id: string } | undefined)
			: undefined;
		if (!day) throw new Error(`INVALID_GPX_LEG_KEY:${gpx.leg_key}`);
		const legKey = gpx.leg_key.replace(/^logbook:d\d+:leg:/, `logbook:day:${day.id}:leg:`);
		insertGpx.run(
			gpx.id,
			kroatia2026TripId,
			day.id,
			legKey,
			gpx.filename,
			gpx.content_type,
			gpx.checksum,
			gpx.byte_size,
			gpx.parser_version,
			gpx.extraction,
			gpx.original,
			gpx.client_id,
			gpx.created_at
		);
	}

	db.prepare(
		`INSERT INTO trip_poi_provider_mappings
		 (trip_id, feature_id, provider, provider_id, source, mapped_at,
		  retry_reason, retry_after, query_version)
		 SELECT ?, feature_id, provider, provider_id, source, mapped_at,
		  retry_reason, retry_after, query_version
		 FROM poi_provider_mappings`
	).run(kroatia2026TripId);

	db.prepare(
		`INSERT INTO trip_poi_enrichment_cache
		 (trip_id, feature_id, provider, schema_version, payload, fetched_at, expires_at)
		 SELECT ?, feature_id, provider, schema_version, payload, fetched_at, expires_at
		 FROM poi_enrichment_cache`
	).run(kroatia2026TripId);
}

function migratedStateKey(db: Database.Database, key: string): string {
	const match = key.match(/^logbook:d(\d+):(.*)$/);
	if (!match) return key;
	const day = db
		.prepare('SELECT id FROM trip_days WHERE trip_id = ? AND position = ? AND active = 1')
		.get(kroatia2026TripId, Number(match[1])) as { id: string } | undefined;
	if (!day) throw new Error(`INVALID_LOGBOOK_DAY_KEY:${key}`);
	return `logbook:day:${day.id}:${match[2]}`;
}

function importShotContent(db: Database.Database, now: string): void {
	const contentPackId = stableUuid('shot-content-pack', kroatia2026TripId);
	const content = JSON.stringify({
		version: 1,
		cameras: cameraChoices,
		backupChecks,
		modules: shotModules,
		activityModuleIds,
		scenarioGroups,
		dayPlans: tripDays.map((day) => ({ dayIndex: day.index, ...shotsDayPlan(day.index) }))
	});
	db.prepare(
		`INSERT INTO shot_content_packs
		 (id, owner_trip_id, name, version, content_json, created_at, updated_at)
		 VALUES (?, ?, ?, 1, ?, ?, ?)`
	).run(contentPackId, kroatia2026TripId, 'Kroatia 2026', content, now, now);
	db.prepare('INSERT INTO trip_shot_content (trip_id, content_pack_id) VALUES (?, ?)').run(
		kroatia2026TripId,
		contentPackId
	);
}

function validateImport(db: Database.Database, sourceStateCount: number): LegacyTripImportReport {
	const receiptCount = db
		.prepare("SELECT COUNT(*) AS count FROM meta WHERE key LIKE 'mutation:%'")
		.get() as { count: number };
	const gpx = db
		.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM gpx_uploads')
		.get() as {
		count: number;
		bytes: number;
	};
	const importedGpx = db
		.prepare(
			'SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM trip_gpx_uploads WHERE trip_id = ?'
		)
		.get(kroatia2026TripId) as { count: number; bytes: number };
	const report: LegacyTripImportReport = {
		tripId: kroatia2026TripId,
		stateEntries: tableCount(db, 'trip_state_entries'),
		mutationReceipts: tableCount(db, 'trip_mutation_receipts'),
		people: tableCount(db, 'people'),
		recipes: tableCount(db, 'recipes'),
		menuEntries: tableCount(db, 'trip_menu_entries'),
		gearCategories: tableCount(db, 'gear_categories'),
		gearItems: tableCount(db, 'gear_items'),
		gpxUploads: importedGpx.count,
		gpxBytes: importedGpx.bytes,
		mapMappings: tableCount(db, 'trip_poi_provider_mappings'),
		mapEnrichments: tableCount(db, 'trip_poi_enrichment_cache')
	};
	const sourceMapMappings = tableCount(db, 'poi_provider_mappings');
	const sourceMapEnrichments = tableCount(db, 'poi_enrichment_cache');

	if (report.stateEntries !== sourceStateCount) throw new Error('STATE_IMPORT_MISMATCH');
	if (report.mutationReceipts !== receiptCount.count) throw new Error('RECEIPT_IMPORT_MISMATCH');
	if (report.gpxUploads !== gpx.count || report.gpxBytes !== gpx.bytes) {
		throw new Error('GPX_IMPORT_MISMATCH');
	}
	if (report.mapMappings !== sourceMapMappings) throw new Error('MAP_MAPPING_IMPORT_MISMATCH');
	if (report.mapEnrichments !== sourceMapEnrichments) {
		throw new Error('MAP_ENRICHMENT_IMPORT_MISMATCH');
	}
	const checksumDifference = db
		.prepare(
			`SELECT COUNT(*) AS count FROM (
				SELECT id, checksum, byte_size, hex(original) AS original FROM gpx_uploads
				EXCEPT
				SELECT id, checksum, byte_size, hex(original) AS original
				FROM trip_gpx_uploads WHERE trip_id = ?
			)`
		)
		.get(kroatia2026TripId) as { count: number };
	if (checksumDifference.count !== 0) throw new Error('GPX_BYTES_MISMATCH');
	if ((db.pragma('foreign_key_check') as unknown[]).length > 0) {
		throw new Error('FOREIGN_KEY_IMPORT_MISMATCH');
	}
	return report;
}

export function importLegacyKroatia2026(
	db: Database.Database,
	options: LegacyTripImportOptions = {}
): LegacyTripImportReport {
	return db.transaction((): LegacyTripImportReport => {
		const completed = db.prepare('SELECT value FROM meta WHERE key = ?').get(importMarker) as
			{ value: string } | undefined;
		if (completed) return JSON.parse(completed.value) as LegacyTripImportReport;
		const existing = db.prepare('SELECT id FROM trips WHERE id = ?').get(kroatia2026TripId);
		if (existing) {
			const report = validateImport(db, tableCount(db, 'state_entries'));
			db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
				importMarker,
				JSON.stringify(report)
			);
			return report;
		}
		if (tableCount(db, 'trips') > 0) throw new Error('LEGACY_TRIP_IMPORT_CONFLICT');

		const now = (options.now ?? new Date()).toISOString();
		const rows = stateRows(db);
		const revision = globalRevision(db);

		db.prepare(
			`INSERT INTO trips
			 (id, slug, name, destination, starts_on, ends_on, timezone, locale,
			  status, visibility, welcome_text, created_at, updated_at)
			 VALUES (?, ?, ?, 'Kroatia', ?, ?, ?, 'nb-NO', 'draft', 'listed', ?, ?, ?)`
		).run(
			kroatia2026TripId,
			kroatia2026Slug,
			kroatia2026Name,
			tripDays[0]?.date,
			tripDays.at(-1)?.date,
			tripTimeZone,
			kroatia2026WelcomeText,
			now,
			now
		);
		db.prepare('INSERT INTO trip_revisions (trip_id, revision) VALUES (?, ?)').run(
			kroatia2026TripId,
			revision
		);

		const insertDay = db.prepare(`
			INSERT INTO trip_days
			(id, trip_id, position, calendar_date, active, date_label, title, phase,
			 created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
		`);
		for (const day of tripDays) {
			insertDay.run(
				stableUuid('kroatia-2026-day', day.date),
				kroatia2026TripId,
				day.index,
				day.date,
				day.dateLabel,
				day.title,
				day.phase,
				now,
				now
			);
		}

		const insertModule = db.prepare(`
			INSERT INTO trip_modules
			(trip_id, module_id, enabled, position, config_version, config_json,
			 configured_at, updated_at)
			VALUES (?, ?, ?, ?, 1, ?, ?, ?)
		`);
		const insertModuleHistory = db.prepare(`
			INSERT INTO trip_module_config_history
			(id, trip_id, module_id, config_version, config_json, changed_at, changed_by_session)
			VALUES (?, ?, ?, 1, ?, ?, NULL)
		`);
		for (const module of moduleCatalog) {
			const configJson = '{}';
			insertModule.run(kroatia2026TripId, module.id, 0, module.order, configJson, now, now);
			insertModuleHistory.run(
				stableUuid('trip-module-history', `${kroatia2026TripId}:${module.id}:1`),
				kroatia2026TripId,
				module.id,
				configJson,
				now
			);
		}

		const insertState = db.prepare(`
			INSERT INTO trip_state_entries
			(trip_id, key, value, revision, client_id, mutation_id, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const row of rows) {
			JSON.parse(row.value);
			insertState.run(
				kroatia2026TripId,
				migratedStateKey(db, row.key),
				row.value,
				row.revision,
				row.client_id,
				row.mutation_id,
				row.updated_at
			);
		}
		const insertReceipt = db.prepare(`
			INSERT INTO trip_mutation_receipts (trip_id, mutation_id, revision)
			VALUES (?, ?, ?)
		`);
		const receipts = db
			.prepare("SELECT key, value FROM meta WHERE key LIKE 'mutation:%' ORDER BY key")
			.all() as Array<{ key: string; value: string }>;
		for (const receipt of receipts) {
			const receiptRevision = Number(receipt.value);
			if (!Number.isSafeInteger(receiptRevision) || receiptRevision <= 0) {
				throw new Error(`INVALID_MUTATION_RECEIPT:${receipt.key}`);
			}
			insertReceipt.run(kroatia2026TripId, receipt.key.slice('mutation:'.length), receiptRevision);
		}

		const ownerIds = importPeople(db, rows, now);
		importMenu(db, rows);
		importGear(db, rows, ownerIds);
		importServerModuleData(db);
		importShotContent(db, now);
		db.prepare('DELETE FROM sessions').run();
		const report = validateImport(db, rows.length);
		db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
			importMarker,
			JSON.stringify(report)
		);

		return report;
	})();
}
