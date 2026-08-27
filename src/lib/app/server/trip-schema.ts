import type { DatabaseMigration } from '$lib/server/database';

export const tripDatabaseMigrations: readonly DatabaseMigration[] = [
	(): void => undefined,
	(): void => undefined,
	(): void => undefined,
	(db): void => {
		db.exec(`
			CREATE TABLE trips (
				id TEXT PRIMARY KEY,
				slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
				name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
				destination TEXT NOT NULL DEFAULT '' CHECK (length(destination) <= 200),
				starts_on TEXT,
				ends_on TEXT,
				timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 100),
				locale TEXT NOT NULL DEFAULT 'nb-NO' CHECK (length(locale) BETWEEN 2 AND 35),
				status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'completed', 'archived')),
				visibility TEXT NOT NULL CHECK (visibility IN ('listed', 'unlisted', 'archived')),
				welcome_text TEXT NOT NULL CHECK (length(trim(welcome_text)) BETWEEN 1 AND 200),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
			);

			CREATE TABLE trip_credentials (
				trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
				password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
				credential_version INTEGER NOT NULL CHECK (credential_version > 0),
				updated_at TEXT NOT NULL
			);

			CREATE TABLE people (
				id TEXT PRIMARY KEY,
				display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
				short_name TEXT CHECK (short_name IS NULL OR length(trim(short_name)) BETWEEN 1 AND 50),
				color TEXT CHECK (color IS NULL OR color GLOB '#[0-9A-Fa-f]*'),
				archived_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX people_display_name ON people(display_name COLLATE NOCASE);

			CREATE TABLE trip_members (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				person_id TEXT NOT NULL REFERENCES people(id),
				active INTEGER NOT NULL CHECK (active IN (0, 1)),
				sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
				trip_label TEXT CHECK (trip_label IS NULL OR length(trim(trip_label)) BETWEEN 1 AND 100),
				joined_at TEXT NOT NULL,
				removed_at TEXT,
				PRIMARY KEY (trip_id, person_id)
			);
			CREATE INDEX trip_members_person ON trip_members(person_id);

			CREATE TABLE trip_days (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				position INTEGER NOT NULL CHECK (position >= 0),
				calendar_date TEXT NOT NULL,
				active INTEGER NOT NULL CHECK (active IN (0, 1)),
				date_label TEXT NOT NULL CHECK (length(trim(date_label)) BETWEEN 1 AND 100),
				title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
				phase TEXT NOT NULL CHECK (length(trim(phase)) BETWEEN 1 AND 100),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE (trip_id, calendar_date)
			);
			CREATE UNIQUE INDEX trip_days_active_position
				ON trip_days(trip_id, position) WHERE active = 1;

			CREATE TABLE trip_member_module_preferences (
				trip_id TEXT NOT NULL,
				person_id TEXT NOT NULL,
				module_id TEXT NOT NULL CHECK (length(module_id) BETWEEN 1 AND 100),
				opted_out INTEGER NOT NULL CHECK (opted_out IN (0, 1)),
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, person_id, module_id),
				FOREIGN KEY (trip_id, person_id)
					REFERENCES trip_members(trip_id, person_id) ON DELETE CASCADE
			);

			CREATE TABLE trip_modules (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				module_id TEXT NOT NULL CHECK (length(module_id) BETWEEN 1 AND 100),
				enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
				position INTEGER NOT NULL CHECK (position >= 0),
				config_version INTEGER NOT NULL CHECK (config_version > 0),
				config_json TEXT NOT NULL CHECK (json_valid(config_json)),
				configured_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, module_id),
				UNIQUE (trip_id, position)
			);

			CREATE TABLE trip_module_config_history (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL,
				module_id TEXT NOT NULL,
				config_version INTEGER NOT NULL CHECK (config_version > 0),
				config_json TEXT NOT NULL CHECK (json_valid(config_json)),
				changed_at TEXT NOT NULL,
				changed_by_session TEXT,
				FOREIGN KEY (trip_id, module_id)
					REFERENCES trip_modules(trip_id, module_id) ON DELETE CASCADE
			);
			CREATE INDEX trip_module_history_lookup
				ON trip_module_config_history(trip_id, module_id, changed_at);

			CREATE TABLE session_trip_grants (
				session_id_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				credential_version INTEGER NOT NULL CHECK (credential_version > 0),
				granted_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL,
				last_used_at INTEGER NOT NULL,
				PRIMARY KEY (session_id_hash, trip_id),
				CHECK (granted_at <= last_used_at AND last_used_at <= expires_at)
			);
			CREATE INDEX session_trip_grants_expiry ON session_trip_grants(expires_at);

			CREATE TABLE session_admin_grants (
				session_id_hash TEXT PRIMARY KEY REFERENCES sessions(id_hash) ON DELETE CASCADE,
				password_fingerprint TEXT NOT NULL CHECK (length(password_fingerprint) = 64),
				granted_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL,
				last_used_at INTEGER NOT NULL,
				CHECK (granted_at <= last_used_at AND last_used_at <= expires_at)
			);
			CREATE INDEX session_admin_grants_expiry ON session_admin_grants(expires_at);

			CREATE TABLE auth_login_attempts (
				scope_key TEXT PRIMARY KEY CHECK (length(scope_key) = 64),
				failure_count INTEGER NOT NULL CHECK (failure_count > 0),
				blocked_until INTEGER NOT NULL,
				last_failed_at INTEGER NOT NULL
			);
			CREATE INDEX auth_login_attempts_expiry ON auth_login_attempts(blocked_until);

			CREATE TABLE trip_audit_log (
				id TEXT PRIMARY KEY,
				trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
				event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
				actor_session_hash TEXT,
				metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
				created_at TEXT NOT NULL
			);
			CREATE INDEX trip_audit_log_trip ON trip_audit_log(trip_id, created_at);

			CREATE TABLE trip_state_entries (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 512),
				value TEXT NOT NULL CHECK (json_valid(value)),
				revision INTEGER NOT NULL CHECK (revision > 0),
				client_id TEXT NOT NULL,
				mutation_id TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, key),
				UNIQUE (trip_id, revision)
			);

			CREATE TABLE trip_revisions (
				trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
				revision INTEGER NOT NULL CHECK (revision >= 0)
			);

			CREATE TABLE trip_mutation_receipts (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				mutation_id TEXT NOT NULL,
				revision INTEGER NOT NULL CHECK (revision > 0),
				PRIMARY KEY (trip_id, mutation_id)
			);

			CREATE TABLE trip_gpx_uploads (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				leg_key TEXT NOT NULL,
				filename TEXT NOT NULL,
				content_type TEXT NOT NULL,
				checksum TEXT NOT NULL,
				byte_size INTEGER NOT NULL CHECK (byte_size > 0),
				parser_version INTEGER NOT NULL CHECK (parser_version > 0),
				extraction TEXT NOT NULL CHECK (json_valid(extraction)),
				original BLOB NOT NULL,
				client_id TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE INDEX trip_gpx_uploads_leg ON trip_gpx_uploads(trip_id, leg_key);

			CREATE TABLE trip_poi_provider_mappings (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				feature_id TEXT NOT NULL,
				provider TEXT NOT NULL CHECK (provider IN ('google', 'tripadvisor')),
				provider_id TEXT,
				source TEXT CHECK (source IN ('kml', 'search')),
				mapped_at TEXT,
				retry_reason TEXT CHECK (retry_reason IN ('no_match', 'rate_limited')),
				retry_after TEXT,
				query_version INTEGER NOT NULL DEFAULT 1 CHECK (query_version > 0),
				PRIMARY KEY (trip_id, feature_id, provider),
				CHECK (
					(provider_id IS NOT NULL AND source IS NOT NULL AND mapped_at IS NOT NULL) OR
					(provider_id IS NULL AND retry_reason IS NOT NULL AND retry_after IS NOT NULL)
				)
			);
			CREATE INDEX trip_poi_provider_retry
				ON trip_poi_provider_mappings(trip_id, retry_after)
				WHERE retry_after IS NOT NULL;

			CREATE TABLE trip_poi_enrichment_cache (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				feature_id TEXT NOT NULL,
				provider TEXT NOT NULL CHECK (provider = 'tripadvisor'),
				schema_version INTEGER NOT NULL CHECK (schema_version > 0),
				payload TEXT NOT NULL CHECK (json_valid(payload)),
				fetched_at TEXT NOT NULL,
				expires_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, feature_id, provider)
			);
			CREATE INDEX trip_poi_enrichment_expiry
				ON trip_poi_enrichment_cache(trip_id, expires_at);

			CREATE TABLE shot_content_packs (
				id TEXT PRIMARY KEY,
				owner_trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
				name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
				version INTEGER NOT NULL CHECK (version > 0),
				content_json TEXT NOT NULL CHECK (json_valid(content_json)),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE trip_shot_content (
				trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
				content_pack_id TEXT NOT NULL REFERENCES shot_content_packs(id)
			);

			CREATE TABLE recipes (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
				archived_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX recipes_name ON recipes(name COLLATE NOCASE);

			CREATE TABLE recipe_versions (
				id TEXT PRIMARY KEY,
				recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
				version INTEGER NOT NULL CHECK (version > 0),
				value TEXT NOT NULL CHECK (json_valid(value)),
				created_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
				created_at TEXT NOT NULL,
				UNIQUE (recipe_id, version)
			);

			CREATE TABLE trip_menu_entries (
				id TEXT PRIMARY KEY,
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				recipe_id TEXT NOT NULL REFERENCES recipes(id),
				recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
				value TEXT NOT NULL CHECK (json_valid(value)),
				active INTEGER NOT NULL CHECK (active IN (0, 1)),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE (trip_id, recipe_id)
			);
			CREATE INDEX trip_menu_entries_trip ON trip_menu_entries(trip_id, active);

			CREATE TABLE gear_categories (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
				sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
				archived_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE gear_items (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
				category_id TEXT REFERENCES gear_categories(id) ON DELETE SET NULL,
				default_quantity INTEGER NOT NULL CHECK (default_quantity BETWEEN 1 AND 999),
				default_notes TEXT NOT NULL DEFAULT '' CHECK (length(default_notes) <= 500),
				lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('available', 'retired')),
				archived_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX gear_items_category ON gear_items(category_id);

			CREATE TABLE gear_item_owners (
				gear_item_id TEXT NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
				person_id TEXT NOT NULL REFERENCES people(id),
				ownership_role TEXT NOT NULL DEFAULT 'owner'
					CHECK (ownership_role IN ('owner', 'shared')),
				PRIMARY KEY (gear_item_id, person_id)
			);
			CREATE INDEX gear_item_owners_person ON gear_item_owners(person_id);

			CREATE TABLE trip_gear_items (
				trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
				gear_item_id TEXT NOT NULL REFERENCES gear_items(id),
				quantity_override INTEGER CHECK (quantity_override BETWEEN 1 AND 999),
				availability TEXT NOT NULL CHECK (availability IN ('available', 'need-to-buy')),
				trip_notes TEXT NOT NULL DEFAULT '' CHECK (length(trip_notes) <= 500),
				owner_resolution TEXT NOT NULL DEFAULT 'current'
					CHECK (owner_resolution IN ('current', 'retained')),
				active INTEGER NOT NULL CHECK (active IN (0, 1)),
				added_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (trip_id, gear_item_id)
			);

			CREATE TABLE trip_gear_packing (
				trip_id TEXT NOT NULL,
				gear_item_id TEXT NOT NULL,
				packed INTEGER NOT NULL CHECK (packed IN (0, 1)),
				packed_at TEXT,
				packed_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
				PRIMARY KEY (trip_id, gear_item_id),
				FOREIGN KEY (trip_id, gear_item_id)
					REFERENCES trip_gear_items(trip_id, gear_item_id) ON DELETE CASCADE
			);
		`);
	}
];
