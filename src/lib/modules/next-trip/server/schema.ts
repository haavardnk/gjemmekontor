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
				(id, trip_id, destination, note, url, submitted_by_person_id, created_at)
			SELECT id, trip_id, destination, note, url, submitted_by_person_id, created_at
			FROM next_trip_suggestions_v5
			WHERE active = 1;

			INSERT INTO next_trip_ratings
				(trip_id, suggestion_id, person_id, score, updated_at)
			SELECT rating.trip_id, rating.suggestion_id, rating.person_id, rating.score,
			       rating.updated_at
			FROM next_trip_ratings_v5 rating
			JOIN next_trip_suggestions suggestion
			  ON suggestion.trip_id = rating.trip_id AND suggestion.id = rating.suggestion_id;

			DROP TABLE next_trip_ratings_v5;
			DROP TABLE next_trip_suggestions_v5;
			DROP TABLE next_trip_participation;
		`);
}
