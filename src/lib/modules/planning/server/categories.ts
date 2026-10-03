import type Database from 'better-sqlite3';

import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import {
	planningCategoryCreateInputSchema,
	planningCategoryInputSchema,
	planningCategoryPlacementInputSchema
} from '../domain/inputs';
import { moveInList, planningLimits } from '../domain/planning';
import { planningCategoryExists, planningSectionCardIds, writePlanningSection } from './queries';

function categoryIds(db: Database.Database, tripId: string): string[] {
	return (
		db
			.prepare(
				'SELECT id FROM planning_categories WHERE trip_id = ? ORDER BY position, created_at, id'
			)
			.all(tripId) as Array<{ id: string }>
	).map((row) => row.id);
}

function writeCategoryOrder(db: Database.Database, tripId: string, ids: readonly string[]): void {
	const update = db.prepare(
		'UPDATE planning_categories SET position = ? WHERE trip_id = ? AND id = ?'
	);
	for (const [position, id] of ids.entries()) update.run(position, tripId, id);
}

export async function handleCreatePlanningCategory(
	request: Request,
	db: Database.Database,
	tripId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCategoryCreateInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_CATEGORY', 400);
	const input = parsed.data;
	if (planningCategoryExists(db, tripId, input.id)) return apiSuccess({ id: input.id });
	const ids = categoryIds(db, tripId);
	if (ids.length >= planningLimits.categories) {
		return apiError('PLANNING_CATEGORY_LIMIT', 409);
	}
	const timestamp = now().toISOString();
	db.prepare(
		`INSERT INTO planning_categories
		 (id, trip_id, name, color, position, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(input.id, tripId, input.name, input.color, ids.length, timestamp, timestamp);
	return apiSuccess({ id: input.id });
}

export async function handleUpdatePlanningCategory(
	request: Request,
	db: Database.Database,
	tripId: string,
	categoryId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCategoryInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_CATEGORY', 400);
	const result = db
		.prepare(
			`UPDATE planning_categories SET name = ?, color = ?, updated_at = ?
			 WHERE trip_id = ? AND id = ?`
		)
		.run(parsed.data.name, parsed.data.color, now().toISOString(), tripId, categoryId);
	return apiSuccess(result.changes ? { updated: true } : { ignored: true });
}

export async function handlePlacePlanningCategory(
	request: Request,
	db: Database.Database,
	tripId: string,
	categoryId: string
): Promise<Response> {
	const parsed = await parseJsonRequest(request, planningCategoryPlacementInputSchema);
	if (!parsed.success) return apiError('INVALID_PLANNING_PLACEMENT', 400);
	const ids = categoryIds(db, tripId);
	if (!ids.includes(categoryId)) return apiSuccess({ ignored: true });
	writeCategoryOrder(db, tripId, moveInList(ids, categoryId, parsed.data.index));
	return apiSuccess({ moved: true });
}

export function handleDeletePlanningCategory(
	db: Database.Database,
	tripId: string,
	categoryId: string
): Response {
	const deleted = db.transaction((): boolean => {
		if (!planningCategoryExists(db, tripId, categoryId)) return false;
		writePlanningSection(db, tripId, null, [
			...planningSectionCardIds(db, tripId, null),
			...planningSectionCardIds(db, tripId, categoryId)
		]);
		db.prepare('DELETE FROM planning_categories WHERE trip_id = ? AND id = ?').run(
			tripId,
			categoryId
		);
		writeCategoryOrder(db, tripId, categoryIds(db, tripId));
		return true;
	})();
	return apiSuccess({ deleted });
}
