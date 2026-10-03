import type Database from 'better-sqlite3';

import {
	createNextTripSchema,
	migrateNextTripSchemaV5,
	migrateNextTripSchemaV6
} from '$lib/modules/next-trip/server/schema';
import { createPlanningSchema } from '$lib/modules/planning/server/schema';
import {
	createCoreSchema,
	createDatabase as createCoreDatabase,
	type DatabaseSchema
} from '$lib/server/database';

import { reconcileBundledTripModules } from './module-reconciliation';
import { createTripSchema } from './trip-schema';

export const applicationDatabaseSchema: DatabaseSchema = {
	version: 8,
	create(db): void {
		createCoreSchema(db);
		createTripSchema(db);
		createNextTripSchema(db);
		createPlanningSchema(db);
	},
	migrate(db, fromVersion): void {
		if (fromVersion < 4 || fromVersion > 7) throw new Error('DATABASE_VERSION_UNSUPPORTED');
		if (fromVersion === 4) createNextTripSchema(db);
		if (fromVersion === 5) migrateNextTripSchemaV5(db);
		if (fromVersion === 6) migrateNextTripSchemaV6(db);
		createPlanningSchema(db);
	}
};

export function createApplicationDatabase(dataDir: string): Database.Database {
	const db = createCoreDatabase(dataDir, applicationDatabaseSchema);
	reconcileBundledTripModules(db);
	return db;
}
