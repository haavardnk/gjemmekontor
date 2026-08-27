import type Database from 'better-sqlite3';

import { logbookDatabaseMigrations } from '$lib/modules/logbook/server/migrations';
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

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
	if (!database) {
		database = createApplicationDatabase(getRuntimeConfig().dataDir);
		importLegacyKroatia2026(database);
	}
	return database;
}
