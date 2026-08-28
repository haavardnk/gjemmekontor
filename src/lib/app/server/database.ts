import type Database from 'better-sqlite3';

import {
	createCoreSchema,
	createDatabase as createCoreDatabase,
	type DatabaseSchema
} from '$lib/server/database';
import { getRuntimeConfig } from '$lib/server/env';

import { createTripSchema } from './trip-schema';

export const applicationDatabaseSchema: DatabaseSchema = {
	// v0.2.0 production databases were released at schema version 4.
	version: 4,
	create(db): void {
		createCoreSchema(db);
		createTripSchema(db);
	}
};

export function createApplicationDatabase(dataDir: string): Database.Database {
	return createCoreDatabase(dataDir, applicationDatabaseSchema);
}

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
	if (!database) {
		database = createApplicationDatabase(getRuntimeConfig().dataDir);
	}
	return database;
}
