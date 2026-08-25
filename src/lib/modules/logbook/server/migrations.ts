import type { DatabaseMigration } from '$lib/server/database';

export const logbookDatabaseMigrations: readonly DatabaseMigration[] = [
	(db): void => {
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
