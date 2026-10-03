import type Database from 'better-sqlite3';
import { z } from 'zod';

import { apiError, apiSuccess } from '$lib/server/api';

import { planningLimits } from '../domain/planning';
import {
	type PlanningFiles,
	planningImageResponse,
	planningPhotoFileNames,
	readPlanningFile,
	removePlanningFiles,
	writePlanningFile
} from './files';
import { jpegDimensions } from './jpeg';
import { isActivePlanningMember, planningCardCategory } from './queries';

const photoIdSchema = z.uuid();

async function formImage(
	form: FormData | undefined,
	name: string,
	maximumBytes: number,
	maximumEdge: number
): Promise<{ body: Uint8Array; width: number; height: number } | undefined> {
	const value = form?.get(name);
	if (!(value instanceof File) || value.size > maximumBytes) return undefined;
	const body = new Uint8Array(await value.arrayBuffer());
	const size = jpegDimensions(body);
	if (!size || Math.max(size.width, size.height) > maximumEdge) return undefined;
	return { body, ...size };
}

export async function handleUploadPlanningPhoto(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string,
	photoId: string,
	files: PlanningFiles,
	now: () => Date = () => new Date()
): Promise<Response> {
	const form = await request.formData().catch(() => undefined);
	const personId = form?.get('personId');
	const full = await formImage(form, 'full', planningLimits.photoBytes, planningLimits.photoEdge);
	const thumb = await formImage(form, 'thumb', planningLimits.thumbBytes, planningLimits.thumbEdge);
	if (
		!photoIdSchema.safeParse(photoId).success ||
		typeof personId !== 'string' ||
		!full ||
		!thumb
	) {
		return apiError('INVALID_PLANNING_PHOTO', 400);
	}
	if (!isActivePlanningMember(db, tripId, personId)) {
		return apiError('PLANNING_MEMBER_REQUIRED', 409);
	}
	const existing = db
		.prepare('SELECT trip_id AS tripId, card_id AS cardId FROM planning_card_photos WHERE id = ?')
		.get(photoId) as { tripId: string; cardId: string } | undefined;
	if (existing) {
		return existing.tripId === tripId && existing.cardId === cardId
			? apiSuccess({ id: photoId })
			: apiError('INVALID_PLANNING_PHOTO', 400);
	}
	if (!planningCardCategory(db, tripId, cardId)) return apiSuccess({ ignored: true });
	const photos = db
		.prepare(
			`SELECT count(*) AS count, COALESCE(MAX(position) + 1, 0) AS position
			 FROM planning_card_photos WHERE trip_id = ? AND card_id = ?`
		)
		.get(tripId, cardId) as { count: number; position: number };
	if (photos.count >= planningLimits.photos) return apiError('PLANNING_PHOTO_LIMIT', 409);
	const [fullName, thumbName] = planningPhotoFileNames(photoId);
	try {
		writePlanningFile(files.photos, fullName, full.body);
		writePlanningFile(files.photos, thumbName, thumb.body);
		db.prepare(
			`INSERT INTO planning_card_photos
			 (id, trip_id, card_id, position, width, height, created_by_person_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			photoId,
			tripId,
			cardId,
			photos.position,
			full.width,
			full.height,
			personId,
			now().toISOString()
		);
	} catch (error) {
		removePlanningFiles(files.photos, [fullName, thumbName]);
		throw error;
	}
	return apiSuccess({ id: photoId });
}

export function handleDeletePlanningPhoto(
	db: Database.Database,
	tripId: string,
	photoId: string,
	files: PlanningFiles
): Response {
	const result = db
		.prepare('DELETE FROM planning_card_photos WHERE trip_id = ? AND id = ?')
		.run(tripId, photoId);
	if (result.changes) removePlanningFiles(files.photos, planningPhotoFileNames(photoId));
	return apiSuccess({ deleted: result.changes > 0 });
}

export function handlePlanningPhoto(
	db: Database.Database,
	tripId: string,
	photoId: string,
	size: string,
	files: PlanningFiles
): Response {
	const [fullName, thumbName] = planningPhotoFileNames(photoId);
	const name = size === 'full' ? fullName : size === 'thumb' ? thumbName : undefined;
	const row = db
		.prepare('SELECT 1 FROM planning_card_photos WHERE trip_id = ? AND id = ?')
		.get(tripId, photoId);
	const body = name && row ? readPlanningFile(files.photos, name) : undefined;
	if (!body) return apiError('PLANNING_IMAGE_NOT_FOUND', 404);
	return planningImageResponse(body, 'image/jpeg');
}
