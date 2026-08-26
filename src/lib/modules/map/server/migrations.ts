import type { DatabaseMigration } from '$lib/server/database';

export const mapDatabaseMigrations: readonly DatabaseMigration[] = [
	(): void => undefined,
	(db): void => {
		db.exec(`
			CREATE TABLE poi_provider_mappings (
				feature_id TEXT NOT NULL,
				provider TEXT NOT NULL CHECK (provider IN ('google', 'tripadvisor')),
				provider_id TEXT,
				source TEXT CHECK (source IN ('kml', 'search')),
				mapped_at TEXT,
				retry_reason TEXT CHECK (retry_reason IN ('no_match', 'rate_limited')),
				retry_after TEXT,
				PRIMARY KEY (feature_id, provider),
				CHECK (
					(provider_id IS NOT NULL AND source IS NOT NULL AND mapped_at IS NOT NULL) OR
					(provider_id IS NULL AND retry_reason IS NOT NULL AND retry_after IS NOT NULL)
				)
			);
			CREATE INDEX poi_provider_mappings_retry_after
				ON poi_provider_mappings (retry_after)
				WHERE retry_after IS NOT NULL;

			CREATE TABLE poi_enrichment_cache (
				feature_id TEXT NOT NULL,
				provider TEXT NOT NULL CHECK (provider = 'tripadvisor'),
				schema_version INTEGER NOT NULL CHECK (schema_version > 0),
				payload TEXT NOT NULL,
				fetched_at TEXT NOT NULL,
				expires_at TEXT NOT NULL,
				PRIMARY KEY (feature_id, provider)
			);
			CREATE INDEX poi_enrichment_cache_expires_at
				ON poi_enrichment_cache (expires_at);
		`);
	},
	(db): void => {
		db.exec(`
			ALTER TABLE poi_provider_mappings
			ADD COLUMN query_version INTEGER NOT NULL DEFAULT 1;
		`);
	}
];
