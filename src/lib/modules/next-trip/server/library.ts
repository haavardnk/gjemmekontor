import type Database from 'better-sqlite3';

import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import {
	nextTripCommentEditInputSchema,
	nextTripCommentInputSchema,
	nextTripRatingDeleteInputSchema,
	nextTripRatingInputSchema,
	nextTripSuggestionEditInputSchema,
	nextTripSuggestionInputSchema
} from '../domain/next-trip';
import { isNextTripMember, loadNextTripPageData } from './queries';

export { loadNextTripPageData };

function suggestionExists(db: Database.Database, tripId: string, suggestionId: string): boolean {
	return Boolean(
		db
			.prepare(
				'SELECT 1 FROM next_trip_suggestions WHERE trip_id = ? AND id = ? AND archived_at IS NULL'
			)
			.get(tripId, suggestionId)
	);
}

export async function handleSaveNextTripSuggestion(
	request: Request,
	db: Database.Database,
	tripId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, nextTripSuggestionInputSchema.strip());
	if (!parsed.success) {
		return apiError('INVALID_NEXT_TRIP_SUGGESTION', 400);
	}
	const input = parsed.data;
	if (!isNextTripMember(db, tripId, input.submittedByPersonId)) {
		return apiError('NEXT_TRIP_MEMBER_REQUIRED', 409);
	}
	if (suggestionExists(db, tripId, input.id)) return apiSuccess({ id: input.id });
	const timestamp = now().toISOString();
	db.prepare(
		`INSERT INTO next_trip_suggestions
		 (id, trip_id, destination, note, url, submitted_by_person_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		input.id,
		tripId,
		input.destination,
		input.note,
		input.url,
		input.submittedByPersonId,
		timestamp,
		timestamp
	);
	return apiSuccess({ id: input.id });
}

export async function handleUpdateNextTripSuggestion(
	request: Request,
	db: Database.Database,
	tripId: string,
	suggestionId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, nextTripSuggestionEditInputSchema);
	if (!parsed.success) return apiError('INVALID_NEXT_TRIP_SUGGESTION', 400);
	const result = db
		.prepare(
			`UPDATE next_trip_suggestions
			 SET destination = ?, note = ?, url = ?, updated_at = ?
			 WHERE trip_id = ? AND id = ? AND archived_at IS NULL`
		)
		.run(
			parsed.data.destination,
			parsed.data.note,
			parsed.data.url,
			now().toISOString(),
			tripId,
			suggestionId
		);
	return apiSuccess(result.changes ? { updated: true } : { ignored: true });
}

export async function handleAddNextTripComment(
	request: Request,
	db: Database.Database,
	tripId: string,
	suggestionId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, nextTripCommentInputSchema);
	if (!parsed.success) return apiError('INVALID_NEXT_TRIP_COMMENT', 400);
	if (!suggestionExists(db, tripId, suggestionId)) return apiSuccess({ ignored: true });
	if (!isNextTripMember(db, tripId, parsed.data.personId)) {
		return apiError('NEXT_TRIP_MEMBER_REQUIRED', 409);
	}
	const existing = db
		.prepare('SELECT 1 FROM next_trip_comments WHERE trip_id = ? AND id = ?')
		.get(tripId, parsed.data.id);
	if (existing) return apiSuccess({ id: parsed.data.id, existing: true });
	const timestamp = now().toISOString();
	db.prepare(
		`INSERT INTO next_trip_comments
		 (id, trip_id, suggestion_id, person_id, body, created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
	).run(
		parsed.data.id,
		tripId,
		suggestionId,
		parsed.data.personId,
		parsed.data.body,
		timestamp,
		timestamp
	);
	return apiSuccess({ id: parsed.data.id });
}

export async function handleUpdateNextTripComment(
	request: Request,
	db: Database.Database,
	tripId: string,
	suggestionId: string,
	commentId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, nextTripCommentEditInputSchema);
	if (!parsed.success) return apiError('INVALID_NEXT_TRIP_COMMENT', 400);
	const result = db
		.prepare(
			`UPDATE next_trip_comments SET body = ?, updated_at = ?
			 WHERE trip_id = ? AND suggestion_id = ? AND id = ? AND deleted_at IS NULL`
		)
		.run(parsed.data.body, now().toISOString(), tripId, suggestionId, commentId);
	return apiSuccess(result.changes ? { updated: true } : { ignored: true });
}

export function handleDeleteNextTripComment(
	db: Database.Database,
	tripId: string,
	suggestionId: string,
	commentId: string,
	now: () => Date = () => new Date()
): Response {
	const timestamp = now().toISOString();
	const result = db
		.prepare(
			`UPDATE next_trip_comments SET deleted_at = ?, updated_at = ?
			 WHERE trip_id = ? AND suggestion_id = ? AND id = ? AND deleted_at IS NULL`
		)
		.run(timestamp, timestamp, tripId, suggestionId, commentId);
	return apiSuccess({ deleted: result.changes > 0 });
}

export function handleDeleteNextTripSuggestion(
	db: Database.Database,
	tripId: string,
	suggestionId: string
): Response {
	const result = db
		.prepare('DELETE FROM next_trip_suggestions WHERE trip_id = ? AND id = ?')
		.run(tripId, suggestionId);
	return apiSuccess({ deleted: result.changes > 0 });
}

export async function handleNextTripRating(
	request: Request,
	db: Database.Database,
	tripId: string,
	suggestionId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, nextTripRatingInputSchema);
	if (!parsed.success) return apiError('INVALID_NEXT_TRIP_RATING', 400);
	if (!suggestionExists(db, tripId, suggestionId)) {
		return apiSuccess({ ignored: true });
	}
	if (!isNextTripMember(db, tripId, parsed.data.personId)) {
		return apiError('NEXT_TRIP_MEMBER_REQUIRED', 409);
	}
	db.prepare(
		`INSERT INTO next_trip_ratings (trip_id, suggestion_id, person_id, score, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(trip_id, suggestion_id, person_id) DO UPDATE SET
		 score = excluded.score, updated_at = excluded.updated_at`
	).run(tripId, suggestionId, parsed.data.personId, parsed.data.score, now().toISOString());
	return apiSuccess({ score: parsed.data.score });
}

export async function handleDeleteNextTripRating(
	request: Request,
	db: Database.Database,
	tripId: string,
	suggestionId: string
): Promise<Response> {
	const parsed = await parseJsonRequest(request, nextTripRatingDeleteInputSchema);
	if (!parsed.success) return apiError('INVALID_NEXT_TRIP_RATING', 400);
	if (!suggestionExists(db, tripId, suggestionId)) return apiSuccess({ ignored: true });
	if (!isNextTripMember(db, tripId, parsed.data.personId)) {
		return apiError('NEXT_TRIP_MEMBER_REQUIRED', 409);
	}
	const result = db
		.prepare(
			'DELETE FROM next_trip_ratings WHERE trip_id = ? AND suggestion_id = ? AND person_id = ?'
		)
		.run(tripId, suggestionId, parsed.data.personId);
	return apiSuccess({ deleted: result.changes > 0 });
}
