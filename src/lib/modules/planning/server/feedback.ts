import type Database from 'better-sqlite3';

import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import {
	planningCommentEditInputSchema,
	planningCommentInputSchema,
	planningReactionDeleteInputSchema,
	planningReactionInputSchema
} from '../domain/inputs';
import { isActivePlanningMember, planningCardCategory } from './queries';

export async function handleSetPlanningReaction(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningReactionInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_REACTION', 400);
	const { personId, reaction } = parsed.data;
	if (!planningCardCategory(db, tripId, cardId)) return apiSuccess({ ignored: true });
	if (!isActivePlanningMember(db, tripId, personId)) {
		return apiError('PLANNING_MEMBER_REQUIRED', 409);
	}
	db.prepare(
		`INSERT INTO planning_card_reactions (trip_id, card_id, person_id, reaction, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(trip_id, card_id, person_id) DO UPDATE SET
		 reaction = excluded.reaction, updated_at = excluded.updated_at`
	).run(tripId, cardId, personId, reaction, now().toISOString());
	return apiSuccess({ reaction });
}

export async function handleDeletePlanningReaction(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningReactionDeleteInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_REACTION', 400);
	const result = db
		.prepare(
			'DELETE FROM planning_card_reactions WHERE trip_id = ? AND card_id = ? AND person_id = ?'
		)
		.run(tripId, cardId, parsed.data.personId);
	return apiSuccess({ deleted: result.changes > 0 });
}

export async function handleAddPlanningComment(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCommentInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_COMMENT', 400);
	const { id, personId, body } = parsed.data;
	if (!planningCardCategory(db, tripId, cardId)) return apiSuccess({ ignored: true });
	if (db.prepare('SELECT 1 FROM planning_card_comments WHERE id = ?').get(id)) {
		return apiSuccess({ id, existing: true });
	}
	if (!isActivePlanningMember(db, tripId, personId)) {
		return apiError('PLANNING_MEMBER_REQUIRED', 409);
	}
	const timestamp = now().toISOString();
	db.prepare(
		`INSERT INTO planning_card_comments
		 (id, trip_id, card_id, person_id, body, created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
	).run(id, tripId, cardId, personId, body, timestamp, timestamp);
	return apiSuccess({ id });
}

export async function handleUpdatePlanningComment(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string,
	commentId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCommentEditInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_COMMENT', 400);
	const result = db
		.prepare(
			`UPDATE planning_card_comments SET body = ?, updated_at = ?
			 WHERE trip_id = ? AND card_id = ? AND id = ? AND deleted_at IS NULL`
		)
		.run(parsed.data.body, now().toISOString(), tripId, cardId, commentId);
	return apiSuccess(result.changes ? { updated: true } : { ignored: true });
}

export function handleDeletePlanningComment(
	db: Database.Database,
	tripId: string,
	cardId: string,
	commentId: string,
	now: () => Date = () => new Date()
): Response {
	const timestamp = now().toISOString();
	const result = db
		.prepare(
			`UPDATE planning_card_comments SET deleted_at = ?, updated_at = ?
			 WHERE trip_id = ? AND card_id = ? AND id = ? AND deleted_at IS NULL`
		)
		.run(timestamp, timestamp, tripId, cardId, commentId);
	return apiSuccess({ deleted: result.changes > 0 });
}
