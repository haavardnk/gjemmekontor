import type Database from 'better-sqlite3';
import { z } from 'zod';

import {
	type MenuActive,
	menuActiveSchema,
	menuArchiveSchema,
	type RecipeArchiveView,
	serializeMenuActive,
	serializeMenuArchive,
	type TripMenuDish
} from '$lib/modules/menu/domain/menu';
import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

type RecipeRow = {
	recipe_id: string;
	version_id: string;
	version: number;
	value: string;
};

type EntryRow = RecipeRow & {
	entry_id: string;
	active_value: string;
	latest_version: number;
};

const saveRecipeSchema = z.object({ recipe: menuArchiveSchema }).strict();
const activateSchema = z
	.object({ active: menuActiveSchema, entryId: z.uuid().optional() })
	.strict();
const updateEntrySchema = z.union([
	z.object({ active: menuActiveSchema }).strict(),
	z.object({ useLatest: z.literal(true) }).strict()
]);

function recipeView(row: RecipeRow): RecipeArchiveView {
	const parsed = menuArchiveSchema.parse(JSON.parse(row.value));
	if (parsed.id !== row.recipe_id) throw new Error('RECIPE_ID_MISMATCH');
	return {
		...parsed,
		recipeVersionId: row.version_id,
		recipeVersion: row.version
	};
}

export function listRecipeArchive(db: Database.Database): RecipeArchiveView[] {
	const rows = db
		.prepare(
			`SELECT r.id AS recipe_id, rv.id AS version_id, rv.version, rv.value
			 FROM recipes r
			 JOIN recipe_versions rv ON rv.recipe_id = r.id
			 WHERE r.archived_at IS NULL
			   AND rv.version = (
			     SELECT MAX(latest.version) FROM recipe_versions latest WHERE latest.recipe_id = r.id
			   )
			 ORDER BY r.name COLLATE NOCASE, r.id`
		)
		.all() as RecipeRow[];
	return rows.map(recipeView);
}

export function listTripMenu(db: Database.Database, tripId: string): TripMenuDish[] {
	const rows = db
		.prepare(
			`SELECT e.id AS entry_id, e.recipe_id, e.recipe_version_id AS version_id,
			        e.value AS active_value, rv.version, rv.value,
			        (SELECT MAX(latest.version) FROM recipe_versions latest
			         WHERE latest.recipe_id = e.recipe_id) AS latest_version
			 FROM trip_menu_entries e
			 JOIN recipe_versions rv ON rv.id = e.recipe_version_id AND rv.recipe_id = e.recipe_id
			 WHERE e.trip_id = ? AND e.active = 1
			 ORDER BY e.created_at, e.id`
		)
		.all(tripId) as EntryRow[];
	return rows.map((row) => {
		const archive = recipeView(row);
		const parsed = menuActiveSchema.parse(JSON.parse(row.active_value));
		if (parsed.archiveId !== row.recipe_id || parsed.tombstone) {
			throw new Error('TRIP_MENU_ENTRY_MISMATCH');
		}
		const active: MenuActive = parsed;
		return {
			entryId: row.entry_id,
			archive,
			active,
			latestRecipeVersion: row.latest_version
		};
	});
}

export async function handleCreateRecipe(
	request: Request,
	db: Database.Database,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, saveRecipeSchema);
	if (!parsed.success || parsed.data.recipe.tombstone) return apiError('INVALID_RECIPE', 400);
	const recipe = parsed.data.recipe;
	const existing = db
		.prepare('SELECT id FROM recipe_versions WHERE recipe_id = ? ORDER BY version DESC LIMIT 1')
		.get(recipe.id) as { id: string } | undefined;
	if (existing) {
		return apiSuccess({ recipeId: recipe.id, recipeVersionId: existing.id, existing: true });
	}
	const timestamp = now().toISOString();
	const versionId = crypto.randomUUID();
	db.transaction(() => {
		db.prepare(
			`INSERT INTO recipes (id, name, archived_at, created_at, updated_at)
			 VALUES (?, ?, NULL, ?, ?)`
		).run(recipe.id, recipe.name, recipe.createdAt, timestamp);
		db.prepare(
			`INSERT INTO recipe_versions
			 (id, recipe_id, version, value, created_by_person_id, created_at)
			 VALUES (?, ?, 1, ?, NULL, ?)`
		).run(versionId, recipe.id, JSON.stringify(serializeMenuArchive(recipe)), timestamp);
	})();
	return apiSuccess({ recipeId: recipe.id, recipeVersionId: versionId, version: 1 });
}

export async function handleUpdateRecipe(
	request: Request,
	db: Database.Database,
	recipeId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, saveRecipeSchema);
	if (!parsed.success || parsed.data.recipe.id !== recipeId || parsed.data.recipe.tombstone) {
		return apiError('INVALID_RECIPE', 400);
	}
	const current = db
		.prepare(
			`SELECT r.created_at, MAX(rv.version) AS version
			 FROM recipes r JOIN recipe_versions rv ON rv.recipe_id = r.id
			 WHERE r.id = ? GROUP BY r.id`
		)
		.get(recipeId) as { created_at: string; version: number } | undefined;
	if (!current) return apiError('RECIPE_NOT_FOUND', 404);
	const recipe = menuArchiveSchema.parse({
		...parsed.data.recipe,
		createdAt: current.created_at
	});
	const version = current.version + 1;
	const versionId = crypto.randomUUID();
	const timestamp = now().toISOString();
	db.transaction(() => {
		db.prepare('UPDATE recipes SET name = ?, updated_at = ? WHERE id = ?').run(
			recipe.name,
			timestamp,
			recipeId
		);
		db.prepare(
			`INSERT INTO recipe_versions
			 (id, recipe_id, version, value, created_by_person_id, created_at)
			 VALUES (?, ?, ?, ?, NULL, ?)`
		).run(versionId, recipeId, version, JSON.stringify(serializeMenuArchive(recipe)), timestamp);
	})();
	return apiSuccess({ recipeId, recipeVersionId: versionId, version });
}

export function handleArchiveRecipe(
	db: Database.Database,
	recipeId: string,
	now: () => Date = () => new Date()
): Response {
	const timestamp = now().toISOString();
	const result = db
		.prepare(
			'UPDATE recipes SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL'
		)
		.run(timestamp, timestamp, recipeId);
	return result.changes ? apiSuccess({ archived: true }) : apiError('RECIPE_NOT_FOUND', 404);
}

export async function handleActivateRecipe(
	request: Request,
	db: Database.Database,
	tripId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, activateSchema);
	if (!parsed.success || parsed.data.active.tombstone) return apiError('INVALID_MENU_ENTRY', 400);
	const active = parsed.data.active;
	const latest = db
		.prepare(
			`SELECT rv.id FROM recipes r JOIN recipe_versions rv ON rv.recipe_id = r.id
			 WHERE r.id = ? AND r.archived_at IS NULL
			 ORDER BY rv.version DESC LIMIT 1`
		)
		.get(active.archiveId) as { id: string } | undefined;
	if (!latest) return apiError('RECIPE_NOT_FOUND', 404);
	const timestamp = now().toISOString();
	const existing = db
		.prepare('SELECT id, active, value FROM trip_menu_entries WHERE trip_id = ? AND recipe_id = ?')
		.get(tripId, active.archiveId) as { id: string; active: number; value: string } | undefined;
	if (existing?.active === 1) {
		const current = menuActiveSchema.safeParse(JSON.parse(existing.value));
		if (
			current.success &&
			(current.data.cycleId === active.cycleId || existing.id === parsed.data.entryId)
		) {
			return apiSuccess({ entryId: existing.id, existing: true });
		}
		return apiError('MENU_ENTRY_EXISTS', 409);
	}
	const entryId = existing?.id ?? parsed.data.entryId ?? crypto.randomUUID();
	if (existing) {
		db.prepare(
			`UPDATE trip_menu_entries
			 SET recipe_version_id = ?, value = ?, active = 1, updated_at = ?
			 WHERE id = ?`
		).run(latest.id, JSON.stringify(serializeMenuActive(active)), timestamp, entryId);
	} else {
		db.prepare(
			`INSERT INTO trip_menu_entries
			 (id, trip_id, recipe_id, recipe_version_id, value, active, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
		).run(
			entryId,
			tripId,
			active.archiveId,
			latest.id,
			JSON.stringify(serializeMenuActive(active)),
			timestamp,
			timestamp
		);
	}
	return apiSuccess({ entryId });
}

export async function handleUpdateMenuEntry(
	request: Request,
	db: Database.Database,
	tripId: string,
	entryId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, updateEntrySchema);
	if (!parsed.success) return apiError('INVALID_MENU_ENTRY', 400);
	const entry = db
		.prepare('SELECT recipe_id FROM trip_menu_entries WHERE id = ? AND trip_id = ?')
		.get(entryId, tripId) as { recipe_id: string } | undefined;
	if (!entry) return apiError('MENU_ENTRY_NOT_FOUND', 404);
	const timestamp = now().toISOString();
	if ('useLatest' in parsed.data) {
		const latest = db
			.prepare('SELECT id FROM recipe_versions WHERE recipe_id = ? ORDER BY version DESC LIMIT 1')
			.get(entry.recipe_id) as { id: string };
		db.prepare(
			'UPDATE trip_menu_entries SET recipe_version_id = ?, updated_at = ? WHERE id = ?'
		).run(latest.id, timestamp, entryId);
		return apiSuccess({ updatedToLatest: true });
	}
	const active = parsed.data.active;
	if (active.archiveId !== entry.recipe_id) return apiError('MENU_ENTRY_RECIPE_MISMATCH', 409);
	db.prepare(
		`UPDATE trip_menu_entries SET value = ?, active = ?, updated_at = ?
		 WHERE id = ? AND trip_id = ?`
	).run(
		JSON.stringify(serializeMenuActive(active)),
		active.tombstone ? 0 : 1,
		timestamp,
		entryId,
		tripId
	);
	return apiSuccess({ active: !active.tombstone });
}
