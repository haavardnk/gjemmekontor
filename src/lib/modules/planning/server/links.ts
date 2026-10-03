import type Database from 'better-sqlite3';

import { apiError, apiSuccess } from '$lib/server/api';

import { type PlanningFiles, readPlanningFile } from './files';

export function handlePlanningLinkImage(
	db: Database.Database,
	tripId: string,
	linkId: string,
	files: PlanningFiles
): Response {
	const row = db
		.prepare(
			`SELECT image_type AS imageType FROM planning_card_links
			 WHERE trip_id = ? AND id = ? AND image_type IS NOT NULL`
		)
		.get(tripId, linkId) as { imageType: string } | undefined;
	const body = row ? readPlanningFile(files.links, linkId) : undefined;
	if (!row || !body) return apiError('PLANNING_IMAGE_NOT_FOUND', 404);
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': row.imageType,
			'cache-control': 'private, max-age=31536000, immutable',
			'content-security-policy': "default-src 'none'"
		}
	});
}

export function handleRetryPlanningLinkPreview(
	db: Database.Database,
	tripId: string,
	linkId: string
): Response {
	const result = db
		.prepare(
			`UPDATE planning_card_links SET status = 'pending'
			 WHERE trip_id = ? AND id = ? AND status = 'failed'`
		)
		.run(tripId, linkId);
	return apiSuccess({ queued: result.changes > 0 });
}
