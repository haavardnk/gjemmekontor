import type Database from 'better-sqlite3';

import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import { nextTripRatingInputSchema, nextTripSuggestionInputSchema } from '../domain/next-trip';
import { isNextTripMember, loadNextTripPageData } from './queries';

export { loadNextTripPageData };

function suggestionExists(db: Database.Database, tripId: string, suggestionId: string): boolean {
	return Boolean(
		db
			.prepare('SELECT 1 FROM next_trip_suggestions WHERE trip_id = ? AND id = ?')
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
	db.prepare(
		`INSERT INTO next_trip_suggestions
		 (id, trip_id, destination, note, url, submitted_by_person_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(
		input.id,
		tripId,
		input.destination,
		input.note,
		input.url,
		input.submittedByPersonId,
		now().toISOString()
	);
	return apiSuccess({ id: input.id });
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
