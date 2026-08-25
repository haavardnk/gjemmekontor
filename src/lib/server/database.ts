import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

export type DatabaseMigration = (db: Database.Database) => void;

export const coreDatabaseMigrations: readonly DatabaseMigration[] = [
	(db: Database.Database): void => {
		db.exec(`
			CREATE TABLE state_entries (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				revision INTEGER NOT NULL UNIQUE CHECK (revision > 0),
				client_id TEXT NOT NULL,
				mutation_id TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE sessions (
				id_hash TEXT PRIMARY KEY,
				expires_at INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX sessions_expires_at ON sessions (expires_at);
			CREATE TABLE meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			INSERT INTO meta (key, value) VALUES ('global_revision', '0');
		`);
	}
];

function migrate(db: Database.Database, migrations: readonly DatabaseMigration[]): void {
	const currentVersion = db.pragma('user_version', { simple: true });
	if (typeof currentVersion !== 'number') {
		throw new Error('INVALID_DATABASE_VERSION');
	}
	if (currentVersion > migrations.length) {
		throw new Error('DATABASE_VERSION_TOO_NEW');
	}

	for (let index = currentVersion; index < migrations.length; index += 1) {
		const migration = migrations[index];
		if (!migration) {
			throw new Error('MISSING_DATABASE_MIGRATION');
		}

		db.transaction((): void => {
			migration(db);
			db.pragma(`user_version = ${index + 1}`);
		})();
	}
}

export function createDatabase(
	dataDir: string,
	migrations: readonly DatabaseMigration[] = coreDatabaseMigrations
): Database.Database {
	mkdirSync(dataDir, { recursive: true });
	const db = new Database(join(dataDir, 'gjemmekontor.sqlite'));
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	db.pragma('synchronous = NORMAL');
	migrate(db, migrations);
	return db;
}
