import type Database from 'better-sqlite3';

import { getRuntimeConfig } from '$lib/server/env';

import { createApplicationDatabase } from './application-database';

export { applicationDatabaseSchema, createApplicationDatabase } from './application-database';

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
	if (!database) {
		database = createApplicationDatabase(getRuntimeConfig().dataDir);
	}
	return database;
}
