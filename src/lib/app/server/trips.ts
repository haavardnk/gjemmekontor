import type Database from 'better-sqlite3';

import { isModuleId, moduleCatalog, type ModuleId } from '$lib/app/modules/catalog';

export type TripSummary = {
	id: string;
	slug: string;
	name: string;
	welcomeText: string;
	status: 'draft' | 'active' | 'completed' | 'archived';
	startsOn?: string;
	endsOn?: string;
	setupRequired: boolean;
};

export type TripAccess = TripSummary & {
	enabledModuleIds: ModuleId[];
};

type TripRow = {
	id: string;
	slug: string;
	name: string;
	welcome_text: string;
	status: TripSummary['status'];
	starts_on: string | null;
	ends_on: string | null;
	has_credential: number;
};

const tripSelect = `
	SELECT t.id, t.slug, t.name, t.welcome_text, t.status, t.starts_on, t.ends_on,
	       EXISTS(SELECT 1 FROM trip_credentials c WHERE c.trip_id = t.id) AS has_credential
	FROM trips t
`;

function summary(row: TripRow): TripSummary {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		welcomeText: row.welcome_text,
		status: row.status,
		...(row.starts_on ? { startsOn: row.starts_on } : {}),
		...(row.ends_on ? { endsOn: row.ends_on } : {}),
		setupRequired: row.status === 'draft' || row.has_credential !== 1
	};
}

function enabledModuleIds(db: Database.Database, tripId: string): ModuleId[] {
	const rows = db
		.prepare(
			`SELECT module_id FROM trip_modules
			 WHERE trip_id = ? AND enabled = 1
			 ORDER BY position, module_id`
		)
		.all(tripId) as Array<{ module_id: string }>;
	return rows.map((row) => row.module_id).filter(isModuleId);
}

function access(db: Database.Database, row: TripRow): TripAccess {
	return { ...summary(row), enabledModuleIds: enabledModuleIds(db, row.id) };
}

export function listSelectableTrips(db: Database.Database): TripSummary[] {
	const rows = db
		.prepare(
			`${tripSelect}
			 WHERE t.visibility = 'listed' AND t.status != 'archived'
			 ORDER BY t.starts_on IS NULL, t.starts_on DESC, t.name COLLATE NOCASE`
		)
		.all() as TripRow[];
	return rows.map(summary);
}

export function listAdminTrips(db: Database.Database): TripSummary[] {
	const rows = db
		.prepare(
			`${tripSelect}
			 ORDER BY t.status = 'archived', t.starts_on IS NULL, t.starts_on DESC,
			          t.name COLLATE NOCASE`
		)
		.all() as TripRow[];
	return rows.map(summary);
}

export function getTripBySlug(db: Database.Database, slug: string): TripAccess | undefined {
	const row = db.prepare(`${tripSelect} WHERE t.slug = ? AND t.status != 'archived'`).get(slug) as
		TripRow | undefined;
	return row ? access(db, row) : undefined;
}

export function getTripById(db: Database.Database, tripId: string): TripAccess | undefined {
	const row = db.prepare(`${tripSelect} WHERE t.id = ? AND t.status != 'archived'`).get(tripId) as
		TripRow | undefined;
	return row ? access(db, row) : undefined;
}

export function firstTripModulePath(trip: TripAccess): string | undefined {
	const firstId = trip.enabledModuleIds[0];
	return moduleCatalog.find((module) => module.id === firstId)?.primaryPath;
}
