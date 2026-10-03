import type Database from 'better-sqlite3';

export function createPlanningSchema(db: Database.Database): void {
	db.exec(`
			CREATE TABLE planning_categories (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
				color TEXT NOT NULL
					CHECK (color IN ('sky', 'emerald', 'amber', 'rose', 'violet', 'slate')),
				position INTEGER NOT NULL CHECK (position >= 0),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE (trip_id, id)
			);
			CREATE INDEX planning_categories_trip ON planning_categories(trip_id, position);

			CREATE TABLE planning_cards (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				category_id TEXT,
				position INTEGER NOT NULL CHECK (position >= 0),
				title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
				body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
				place_label TEXT
					CHECK (place_label IS NULL OR length(trim(place_label)) BETWEEN 1 AND 300),
				place_lat REAL CHECK (place_lat IS NULL OR place_lat BETWEEN -90 AND 90),
				place_lng REAL CHECK (place_lng IS NULL OR place_lng BETWEEN -180 AND 180),
				place_google_id TEXT CHECK (place_google_id IS NULL OR length(place_google_id) <= 300),
				created_by_person_id TEXT NOT NULL,
				updated_by_person_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE (trip_id, id),
				CHECK ((place_lat IS NULL) = (place_lng IS NULL)),
				CHECK (place_label IS NOT NULL OR (place_lat IS NULL AND place_google_id IS NULL)),
				FOREIGN KEY (trip_id, category_id) REFERENCES planning_categories(trip_id, id),
				FOREIGN KEY (trip_id, created_by_person_id) REFERENCES trip_members(trip_id, person_id),
				FOREIGN KEY (trip_id, updated_by_person_id) REFERENCES trip_members(trip_id, person_id)
			);
			CREATE INDEX planning_cards_section ON planning_cards(trip_id, category_id, position);

			CREATE TABLE planning_checklist_items (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL,
				card_id TEXT NOT NULL,
				position INTEGER NOT NULL CHECK (position >= 0),
				text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 200),
				checked_at TEXT,
				checked_by_person_id TEXT,
				CHECK ((checked_at IS NULL) = (checked_by_person_id IS NULL)),
				FOREIGN KEY (trip_id, card_id) REFERENCES planning_cards(trip_id, id) ON DELETE CASCADE,
				FOREIGN KEY (trip_id, checked_by_person_id) REFERENCES trip_members(trip_id, person_id)
			);
			CREATE INDEX planning_checklist_items_card
				ON planning_checklist_items(trip_id, card_id, position);

			CREATE TABLE planning_card_links (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL,
				card_id TEXT NOT NULL,
				position INTEGER NOT NULL CHECK (position >= 0),
				url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
				status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
				title TEXT CHECK (title IS NULL OR length(title) <= 300),
				description TEXT CHECK (description IS NULL OR length(description) <= 500),
				site_name TEXT CHECK (site_name IS NULL OR length(site_name) <= 100),
				image_type TEXT CHECK (
					image_type IS NULL
					OR image_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif')
				),
				fetched_at TEXT,
				CHECK (status = 'ready' OR image_type IS NULL),
				FOREIGN KEY (trip_id, card_id) REFERENCES planning_cards(trip_id, id) ON DELETE CASCADE
			);
			CREATE INDEX planning_card_links_card ON planning_card_links(trip_id, card_id, position);
			CREATE INDEX planning_card_links_pending ON planning_card_links(trip_id, status);

			CREATE TABLE planning_card_photos (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL,
				card_id TEXT NOT NULL,
				position INTEGER NOT NULL CHECK (position >= 0),
				width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 2048),
				height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 2048),
				created_by_person_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (trip_id, card_id) REFERENCES planning_cards(trip_id, id) ON DELETE CASCADE,
				FOREIGN KEY (trip_id, created_by_person_id) REFERENCES trip_members(trip_id, person_id)
			);
			CREATE INDEX planning_card_photos_card ON planning_card_photos(trip_id, card_id, position);
		`);
}
