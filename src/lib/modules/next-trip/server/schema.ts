import type Database from 'better-sqlite3';

export function createNextTripSchema(db: Database.Database): void {
	db.exec(`
			CREATE TABLE next_trip_suggestions (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				destination TEXT NOT NULL CHECK (length(trim(destination)) BETWEEN 1 AND 200),
				note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
				url TEXT NOT NULL DEFAULT '' CHECK (length(url) <= 2000),
				submitted_by_person_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				archived_at TEXT,
				UNIQUE (trip_id, id),
				FOREIGN KEY (trip_id, submitted_by_person_id)
					REFERENCES trip_members(trip_id, person_id)
			);
			CREATE INDEX next_trip_suggestions_trip
				ON next_trip_suggestions(trip_id, created_at);

			CREATE TABLE next_trip_ratings (
				trip_id TEXT NOT NULL,
				suggestion_id TEXT NOT NULL,
				person_id TEXT NOT NULL,
				score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, suggestion_id, person_id),
				FOREIGN KEY (trip_id, suggestion_id)
					REFERENCES next_trip_suggestions(trip_id, id) ON DELETE CASCADE,
				FOREIGN KEY (trip_id, person_id)
					REFERENCES trip_members(trip_id, person_id) ON DELETE CASCADE
			);
			CREATE INDEX next_trip_ratings_suggestion
				ON next_trip_ratings(trip_id, suggestion_id);

			CREATE TABLE next_trip_comments (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL,
				suggestion_id TEXT NOT NULL,
				person_id TEXT NOT NULL,
				body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				deleted_at TEXT,
				UNIQUE (trip_id, suggestion_id, id),
				FOREIGN KEY (trip_id, suggestion_id)
					REFERENCES next_trip_suggestions(trip_id, id) ON DELETE CASCADE,
				FOREIGN KEY (trip_id, person_id)
					REFERENCES trip_members(trip_id, person_id) ON DELETE CASCADE
			);
			CREATE INDEX next_trip_comments_suggestion
				ON next_trip_comments(trip_id, suggestion_id, created_at);
		`);
}

export function migrateNextTripSchemaV5(db: Database.Database): void {
	db.exec(`
			PRAGMA defer_foreign_keys = ON;
			DROP INDEX next_trip_ratings_suggestion;
			DROP INDEX next_trip_suggestions_trip;
			ALTER TABLE next_trip_ratings RENAME TO next_trip_ratings_v5;
			ALTER TABLE next_trip_suggestions RENAME TO next_trip_suggestions_v5;
		`);
	createNextTripSchema(db);
	db.exec(`
			INSERT INTO next_trip_suggestions
				(id, trip_id, destination, note, url, submitted_by_person_id,
				 created_at, updated_at, archived_at)
			SELECT id, trip_id, destination, note, url, submitted_by_person_id, created_at,
			       CASE WHEN updated_at = '' THEN created_at ELSE updated_at END,
			       CASE WHEN active = 0
			            THEN CASE WHEN updated_at = '' THEN created_at ELSE updated_at END
			            ELSE NULL END
			FROM next_trip_suggestions_v5;

			INSERT INTO next_trip_ratings
				(trip_id, suggestion_id, person_id, score, updated_at)
			SELECT trip_id, suggestion_id, person_id, score, updated_at
			FROM next_trip_ratings_v5;

			DROP TABLE next_trip_ratings_v5;
			DROP TABLE next_trip_suggestions_v5;
			DROP TABLE next_trip_participation;
		`);
}

export function migrateNextTripSchemaV6(db: Database.Database): void {
	db.exec(`
			PRAGMA defer_foreign_keys = ON;
			DROP INDEX next_trip_ratings_suggestion;
			DROP INDEX next_trip_suggestions_trip;
			ALTER TABLE next_trip_ratings RENAME TO next_trip_ratings_v6;
			ALTER TABLE next_trip_suggestions RENAME TO next_trip_suggestions_v6;
		`);
	createNextTripSchema(db);
	db.exec(`
			INSERT INTO next_trip_suggestions
				(id, trip_id, destination, note, url, submitted_by_person_id,
				 created_at, updated_at, archived_at)
			SELECT id, trip_id, destination, note, url, submitted_by_person_id,
			       created_at, created_at, NULL
			FROM next_trip_suggestions_v6;

			INSERT INTO next_trip_ratings
				(trip_id, suggestion_id, person_id, score, updated_at)
			SELECT trip_id, suggestion_id, person_id, score, updated_at
			FROM next_trip_ratings_v6;

			DROP TABLE next_trip_ratings_v6;
			DROP TABLE next_trip_suggestions_v6;
		`);
}
