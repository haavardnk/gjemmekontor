import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import { getRuntimeConfig } from './env';

const migrations = [
	(db: Database.Database): void => {
		db.exec(`
			CREATE TABLE IF NOT EXISTS state_entries (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				revision INTEGER NOT NULL UNIQUE CHECK (revision > 0),
				client_id TEXT NOT NULL,
				mutation_id TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS sessions (
				id_hash TEXT PRIMARY KEY,
				expires_at INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
			CREATE TABLE IF NOT EXISTS meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			INSERT OR IGNORE INTO meta (key, value) VALUES ('global_revision', '0');
		`);
	},
	(db: Database.Database): void => {
		db.exec(`
			CREATE TABLE gpx_uploads (
				id TEXT PRIMARY KEY,
				leg_key TEXT NOT NULL,
				filename TEXT NOT NULL,
				content_type TEXT NOT NULL,
				checksum TEXT NOT NULL,
				byte_size INTEGER NOT NULL CHECK (byte_size > 0),
				parser_version INTEGER NOT NULL CHECK (parser_version > 0),
				extraction TEXT NOT NULL,
				original BLOB NOT NULL,
				client_id TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE INDEX gpx_uploads_leg_key ON gpx_uploads (leg_key);
		`);
	}
];

function migrate(db: Database.Database): void {
	const currentVersion = db.pragma('user_version', { simple: true });
	if (typeof currentVersion !== 'number') {
		throw new Error('INVALID_DATABASE_VERSION');
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

export function createDatabase(dataDir: string): Database.Database {
	mkdirSync(dataDir, { recursive: true });
	const db = new Database(join(dataDir, 'gjemmekontor.sqlite'));
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	db.pragma('synchronous = NORMAL');
	migrate(db);
	return db;
}

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
	if (!database) {
		database = createDatabase(getRuntimeConfig().dataDir);
	}

	return database;
}
