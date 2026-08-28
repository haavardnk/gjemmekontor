import type Database from 'better-sqlite3';

import { logbookDatabaseMigrations } from '$lib/modules/logbook/server/migrations';
import { migrateLegacyMapFiles } from '$lib/modules/map/server/legacy-files';
import { mapDatabaseMigrations } from '$lib/modules/map/server/migrations';
import {
	coreDatabaseMigrations,
	createDatabase as createCoreDatabase,
	type DatabaseMigration
} from '$lib/server/database';
import { getRuntimeConfig } from '$lib/server/env';

import { importLegacyKroatia2026 } from './legacy-trip-import';
import { tripDatabaseMigrations } from './trip-schema';

function combineMigrations(
	...groups: readonly (readonly DatabaseMigration[])[]
): DatabaseMigration[] {
	const count = Math.max(...groups.map((group) => group.length));
	return Array.from({ length: count }, (_, index) => (db): void => {
		for (const group of groups) group[index]?.(db);
	});
}

export const applicationDatabaseMigrations = combineMigrations(
	coreDatabaseMigrations,
	logbookDatabaseMigrations,
	mapDatabaseMigrations,
	tripDatabaseMigrations
);

export function createApplicationDatabase(dataDir: string): Database.Database {
	return createCoreDatabase(dataDir, applicationDatabaseMigrations);
}

export function initializeApplicationDatabase(dataDir: string): Database.Database {
	const nextDatabase = createApplicationDatabase(dataDir);
	try {
		const report = importLegacyKroatia2026(nextDatabase);
		migrateLegacyMapFiles(dataDir, report.tripId);
		return nextDatabase;
	} catch (error) {
		nextDatabase.close();
		throw error;
	}
}

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
	if (!database) {
		database = initializeApplicationDatabase(getRuntimeConfig().dataDir);
	}
	return database;
}
