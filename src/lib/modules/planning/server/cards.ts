import type Database from 'better-sqlite3';

import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import {
	planningCardCreateInputSchema,
	type PlanningCardInput,
	planningCardInputSchema,
	planningCardPlacementInputSchema,
	planningChecklistToggleInputSchema
} from '../domain/inputs';
import { moveInList, planningLimits } from '../domain/planning';
import {
	isActivePlanningMember,
	planningCardCategory,
	planningCategoryExists,
	planningSectionCardIds,
	writePlanningSection
} from './queries';

type ChecklistState = { id: string; checkedAt: string | null; checkedByPersonId: string | null };

function cardInputError(
	db: Database.Database,
	tripId: string,
	cardId: string,
	input: PlanningCardInput
): Response | undefined {
	if (!isActivePlanningMember(db, tripId, input.personId)) {
		return apiError('PLANNING_MEMBER_REQUIRED', 409);
	}
	if (input.categoryId && !planningCategoryExists(db, tripId, input.categoryId)) {
		return apiError('PLANNING_CATEGORY_NOT_FOUND', 409);
	}
	const foreignItem = db
		.prepare(
			`SELECT 1 FROM planning_checklist_items
			 WHERE id IN (SELECT value FROM json_each(?)) AND (trip_id != ? OR card_id != ?)`
		)
		.get(JSON.stringify(input.checklist.map((item) => item.id)), tripId, cardId);
	if (foreignItem) return apiError('INVALID_PLANNING_CARD', 400);
	return undefined;
}

function placeColumns(input: PlanningCardInput): Array<string | number | null> {
	return [
		input.place?.label ?? null,
		input.place?.lat ?? null,
		input.place?.lng ?? null,
		input.place?.googlePlaceId ?? null
	];
}

function writeChecklist(
	db: Database.Database,
	tripId: string,
	cardId: string,
	input: PlanningCardInput,
	timestamp: string
): void {
	const existing = new Map(
		(
			db
				.prepare(
					`SELECT id, checked_at AS checkedAt, checked_by_person_id AS checkedByPersonId
					 FROM planning_checklist_items WHERE trip_id = ? AND card_id = ?`
				)
				.all(tripId, cardId) as ChecklistState[]
		).map((item) => [item.id, item])
	);
	const kept = new Set(input.checklist.map((item) => item.id));
	const remove = db.prepare('DELETE FROM planning_checklist_items WHERE id = ?');
	for (const id of existing.keys()) if (!kept.has(id)) remove.run(id);
	const upsert = db.prepare(
		`INSERT INTO planning_checklist_items
		 (id, trip_id, card_id, position, text, checked_at, checked_by_person_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		 position = excluded.position, text = excluded.text,
		 checked_at = excluded.checked_at, checked_by_person_id = excluded.checked_by_person_id`
	);
	for (const [position, item] of input.checklist.entries()) {
		const previous = existing.get(item.id);
		upsert.run(
			item.id,
			tripId,
			cardId,
			position,
			item.text,
			item.checked ? (previous?.checkedAt ?? timestamp) : null,
			item.checked ? (previous?.checkedByPersonId ?? input.personId) : null
		);
	}
}

export async function handleCreatePlanningCard(
	request: Request,
	db: Database.Database,
	tripId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCardCreateInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_CARD', 400);
	const { id, ...input } = parsed.data;
	if (planningCardCategory(db, tripId, id)) return apiSuccess({ id });
	const error = cardInputError(db, tripId, id, input);
	if (error) return error;
	const count = db
		.prepare('SELECT count(*) AS count FROM planning_cards WHERE trip_id = ?')
		.get(tripId) as { count: number };
	if (count.count >= planningLimits.cards) return apiError('PLANNING_CARD_LIMIT', 409);
	const timestamp = now().toISOString();
	db.transaction((): void => {
		db.prepare(
			`INSERT INTO planning_cards
			 (id, trip_id, category_id, position, title, body,
			  place_label, place_lat, place_lng, place_google_id,
			  created_by_person_id, updated_by_person_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			id,
			tripId,
			input.categoryId,
			planningSectionCardIds(db, tripId, input.categoryId).length,
			input.title,
			input.body,
			...placeColumns(input),
			input.personId,
			input.personId,
			timestamp,
			timestamp
		);
		writeChecklist(db, tripId, id, input, timestamp);
	})();
	return apiSuccess({ id });
}

export async function handleUpdatePlanningCard(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCardInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_CARD', 400);
	const input = parsed.data;
	const current = planningCardCategory(db, tripId, cardId);
	if (!current) return apiSuccess({ ignored: true });
	const error = cardInputError(db, tripId, cardId, input);
	if (error) return error;
	const timestamp = now().toISOString();
	db.transaction((): void => {
		if (current.categoryId !== input.categoryId) {
			writePlanningSection(
				db,
				tripId,
				current.categoryId,
				planningSectionCardIds(db, tripId, current.categoryId).filter((id) => id !== cardId)
			);
			writePlanningSection(db, tripId, input.categoryId, [
				...planningSectionCardIds(db, tripId, input.categoryId),
				cardId
			]);
		}
		db.prepare(
			`UPDATE planning_cards
			 SET title = ?, body = ?, place_label = ?, place_lat = ?, place_lng = ?,
			     place_google_id = ?, updated_by_person_id = ?, updated_at = ?
			 WHERE trip_id = ? AND id = ?`
		).run(
			input.title,
			input.body,
			...placeColumns(input),
			input.personId,
			timestamp,
			tripId,
			cardId
		);
		writeChecklist(db, tripId, cardId, input, timestamp);
	})();
	return apiSuccess({ updated: true });
}

export async function handlePlacePlanningCard(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCardPlacementInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_PLACEMENT', 400);
	const { categoryId, index } = parsed.data;
	const current = planningCardCategory(db, tripId, cardId);
	if (!current) return apiSuccess({ ignored: true });
	if (categoryId && !planningCategoryExists(db, tripId, categoryId)) {
		return apiError('PLANNING_CATEGORY_NOT_FOUND', 409);
	}
	db.transaction((): void => {
		const source = planningSectionCardIds(db, tripId, current.categoryId);
		if (current.categoryId !== categoryId) {
			writePlanningSection(
				db,
				tripId,
				current.categoryId,
				source.filter((id) => id !== cardId)
			);
		}
		const target =
			current.categoryId === categoryId ? source : planningSectionCardIds(db, tripId, categoryId);
		writePlanningSection(db, tripId, categoryId, moveInList(target, cardId, index));
	})();
	return apiSuccess({ moved: true });
}

export function handleDeletePlanningCard(
	db: Database.Database,
	tripId: string,
	cardId: string
): Response {
	const result = db
		.prepare('DELETE FROM planning_cards WHERE trip_id = ? AND id = ?')
		.run(tripId, cardId);
	return apiSuccess({ deleted: result.changes > 0 });
}

export async function handleTogglePlanningChecklistItem(
	request: Request,
	db: Database.Database,
	tripId: string,
	cardId: string,
	itemId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningChecklistToggleInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_CHECKLIST_ITEM', 400);
	const { personId, checked } = parsed.data;
	if (!isActivePlanningMember(db, tripId, personId)) {
		return apiError('PLANNING_MEMBER_REQUIRED', 409);
	}
	const result = db
		.prepare(
			`UPDATE planning_checklist_items
			 SET checked_at = CASE WHEN ? THEN COALESCE(checked_at, ?) END,
			     checked_by_person_id = CASE WHEN ? THEN COALESCE(checked_by_person_id, ?) END
			 WHERE trip_id = ? AND card_id = ? AND id = ?`
		)
		.run(Number(checked), now().toISOString(), Number(checked), personId, tripId, cardId, itemId);
	return apiSuccess(result.changes ? { checked } : { ignored: true });
}
