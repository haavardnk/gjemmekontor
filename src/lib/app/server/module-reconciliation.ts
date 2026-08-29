import type Database from 'better-sqlite3';

import { moduleCatalog } from '$lib/app/modules/catalog';

export function reconcileBundledTripModules(
	db: Database.Database,
	now: () => Date = (): Date => new Date()
): void {
	db.transaction((): void => {
		const tripIds = db.prepare('SELECT id FROM trips').all() as Array<{ id: string }>;
		const existing = db.prepare('SELECT module_id FROM trip_modules WHERE trip_id = ?');
		const maximumPosition = db.prepare(
			'SELECT COALESCE(MAX(position), -1) AS position FROM trip_modules WHERE trip_id = ?'
		);
		const insert = db.prepare(
			`INSERT INTO trip_modules
			 (trip_id, module_id, enabled, position, config_version, config_json,
			  configured_at, updated_at)
			 VALUES (?, ?, 0, ?, 1, '{}', ?, ?)`
		);
		for (const trip of tripIds) {
			const moduleIds = new Set(
				(existing.all(trip.id) as Array<{ module_id: string }>).map((row) => row.module_id)
			);
			let position = (maximumPosition.get(trip.id) as { position: number }).position;
			for (const module of moduleCatalog) {
				if (moduleIds.has(module.id)) continue;
				position += 1;
				const timestamp = now().toISOString();
				insert.run(trip.id, module.id, position, timestamp, timestamp);
			}
		}
	})();
}
