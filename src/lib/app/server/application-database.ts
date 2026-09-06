import type Database from 'better-sqlite3';

import {
	createNextTripSchema,
	migrateNextTripSchemaV5
} from '$lib/modules/next-trip/server/schema';
import {
	createCoreSchema,
	createDatabase as createCoreDatabase,
	type DatabaseSchema
} from '$lib/server/database';

import { reconcileBundledTripModules } from './module-reconciliation';
import { createTripSchema } from './trip-schema';

export const applicationDatabaseSchema: DatabaseSchema = {
	version: 6,
	create(db): void {
		createCoreSchema(db);
		createTripSchema(db);
		createNextTripSchema(db);
	},
	migrate(db, fromVersion): void {
		if (fromVersion === 4) {
			createNextTripSchema(db);
			return;
		}
		if (fromVersion === 5) {
			migrateNextTripSchemaV5(db);
			return;
		}
		throw new Error('DATABASE_VERSION_UNSUPPORTED');
	}
};

export function createApplicationDatabase(dataDir: string): Database.Database {
	const db = createCoreDatabase(dataDir, applicationDatabaseSchema);
	reconcileBundledTripModules(db);
	return db;
}
