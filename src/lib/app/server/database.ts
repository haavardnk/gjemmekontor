import type Database from 'better-sqlite3';

import { logbookDatabaseMigrations } from '$lib/modules/logbook/server/migrations';
import {
	coreDatabaseMigrations,
	createDatabase as createCoreDatabase,
	type DatabaseMigration
} from '$lib/server/database';
import { getRuntimeConfig } from '$lib/server/env';

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
	logbookDatabaseMigrations
);

export function createApplicationDatabase(dataDir: string): Database.Database {
	return createCoreDatabase(dataDir, applicationDatabaseMigrations);
}

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
	if (!database) database = createApplicationDatabase(getRuntimeConfig().dataDir);
	return database;
}
