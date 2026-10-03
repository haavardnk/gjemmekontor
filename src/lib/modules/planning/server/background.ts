import type Database from 'better-sqlite3';

import { liveUpdates } from '$lib/server/live-updates';

import { runtimePlanningFiles, sweepPlanningDirectory } from './files';
import { refreshPlanningLinkPreviews } from './link-previews';

const sweptTrips = new Set<string>();

export function startPlanningBackgroundWork(db: Database.Database, tripId: string): void {
	const files = runtimePlanningFiles(tripId);
	if (!sweptTrips.has(tripId)) {
		sweptTrips.add(tripId);
		const linkImages = db
			.prepare('SELECT id FROM planning_card_links WHERE trip_id = ? AND image_type IS NOT NULL')
			.all(tripId) as Array<{ id: string }>;
		sweepPlanningDirectory(files.links, new Set(linkImages.map(({ id }) => id)));
	}
	void refreshPlanningLinkPreviews(db, tripId, files).then(
		(changed) => {
			if (changed)
				liveUpdates.publish(tripId, { state: false, modules: ['planning'], reload: false });
		},
		() => undefined
	);
}
