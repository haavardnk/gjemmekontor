import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

export type DatabaseSchema = {
	version: number;
	create: (db: Database.Database) => void;
};

export function createCoreSchema(db: Database.Database): void {
	db.exec(`
			CREATE TABLE sessions (
				id_hash TEXT PRIMARY KEY,
				expires_at INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX sessions_expires_at ON sessions (expires_at);
		`);
}

export const coreDatabaseSchema: DatabaseSchema = {
	version: 1,
	create: createCoreSchema
};

function ensureSchema(db: Database.Database, schema: DatabaseSchema): void {
	const currentVersion = db.pragma('user_version', { simple: true });
	if (typeof currentVersion !== 'number') {
		throw new Error('INVALID_DATABASE_VERSION');
	}
	if (currentVersion > schema.version) {
		throw new Error('DATABASE_VERSION_TOO_NEW');
	}
	if (currentVersion !== 0 && currentVersion !== schema.version) {
		throw new Error('DATABASE_VERSION_UNSUPPORTED');
	}
	if (currentVersion === schema.version) return;
	db.transaction((): void => {
		schema.create(db);
		db.pragma(`user_version = ${schema.version}`);
	})();
}

export function createDatabase(
	dataDir: string,
	schema: DatabaseSchema = coreDatabaseSchema
): Database.Database {
	mkdirSync(dataDir, { recursive: true });
	const db = new Database(join(dataDir, 'gjemmekontor.sqlite'));
	try {
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
		db.pragma('synchronous = NORMAL');
		ensureSchema(db, schema);
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
