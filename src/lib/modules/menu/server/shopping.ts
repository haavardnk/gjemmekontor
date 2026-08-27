import type Database from 'better-sqlite3';
import { z } from 'zod';

import { serializeMenuActive, type TripMenuDish } from '$lib/modules/menu/domain/menu';
import {
	createMenuShoppingPreview,
	menuShoppingFingerprint,
	type MenuShoppingScope
} from '$lib/modules/menu/domain/shopping';
import { absoluteShoppingOperationSchema } from '$lib/modules/shopping-list/public';
import {
	BringService,
	BringServiceError,
	getBringService
} from '$lib/modules/shopping-list/server-public';
import { apiError, apiSuccess } from '$lib/server/api';

import { listTripMenu } from './library';

const cycleSchema = z.object({ archiveId: z.uuid(), cycleId: z.uuid() }).strict();
const nameOverridesSchema = z
	.record(z.string().length(16), z.string().trim().min(1).max(100))
	.refine((value) => Object.keys(value).length <= 250);
const previewRequestSchema = z
	.object({
		scope: z.enum(['dish', 'menu']),
		cycles: z.array(cycleSchema).min(1).max(100),
		includeAlreadyAdded: z.boolean().default(false),
		nameOverrides: nameOverridesSchema.default({})
	})
	.strict();
const applyRequestSchema = previewRequestSchema.extend({
	fingerprint: z.string().length(64),
	rows: z
		.array(
			z
				.object({ id: z.string().length(16), include: z.boolean() })
				.merge(absoluteShoppingOperationSchema)
				.strict()
		)
		.max(250)
});

type ScopeRequest = z.infer<typeof previewRequestSchema>;

function loadDishes(db: Database.Database, tripId: string, input: ScopeRequest): TripMenuDish[] {
	const byRecipeId = new Map(listTripMenu(db, tripId).map((dish) => [dish.archive.id, dish]));
	return input.cycles.map(({ archiveId, cycleId }) => {
		const dish = byRecipeId.get(archiveId);
		if (!dish || dish.active.cycleId !== cycleId) {
			throw new Error('MENU_SCOPE_STALE');
		}
		return dish;
	});
}

async function parseRequest(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

function bringError(error: unknown): Response {
	if (error instanceof BringServiceError) {
		return apiError(error.code, error.code === 'BRING_NOT_CONFIGURED' ? 503 : 502);
	}
	if (error instanceof Error && error.message === 'MENU_SCOPE_STALE') {
		return apiError('MENU_SCOPE_STALE', 409);
	}
	return apiError('BRING_UNAVAILABLE', 502);
}

export async function handleMenuShoppingPreview(
	request: Request,
	db: Database.Database,
	tripId: string,
	bring: BringService = getBringService(),
	shoppingListEnabled = true
): Promise<Response> {
	if (!shoppingListEnabled) return apiError('SHOPPING_LIST_DISABLED', 503);
	const parsed = previewRequestSchema.safeParse(await parseRequest(request));
	if (!parsed.success) return apiError('INVALID_REQUEST', 400);
	try {
		const dishes = loadDishes(db, tripId, parsed.data);
		const planning = await bring.planningSnapshot();
		return apiSuccess(
			createMenuShoppingPreview(
				dishes,
				planning,
				parsed.data.scope as MenuShoppingScope,
				parsed.data.includeAlreadyAdded,
				parsed.data.nameOverrides
			)
		);
	} catch (error) {
		return bringError(error);
	}
}

export async function handleMenuShoppingApply(
	request: Request,
	db: Database.Database,
	tripId: string,
	bring: BringService = getBringService(),
	now: () => Date = () => new Date(),
	shoppingListEnabled = true
): Promise<Response> {
	if (!shoppingListEnabled) return apiError('SHOPPING_LIST_DISABLED', 503);
	const parsed = applyRequestSchema.safeParse(await parseRequest(request));
	if (!parsed.success) return apiError('INVALID_REQUEST', 400);
	try {
		const dishes = loadDishes(db, tripId, parsed.data);
		if (menuShoppingFingerprint(dishes) !== parsed.data.fingerprint) {
			return apiError('MENU_PREVIEW_STALE', 409);
		}
		const planning = await bring.planningSnapshot();
		const preview = createMenuShoppingPreview(
			dishes,
			planning,
			parsed.data.scope,
			parsed.data.includeAlreadyAdded,
			parsed.data.nameOverrides
		);
		const previewById = new Map(preview.rows.map((row) => [row.id, row]));
		const included = parsed.data.rows.filter((row) => row.include);
		const uniqueSourceNames = new Set(included.map((row) => row.sourceName));
		if (
			!included.length ||
			included.some((row) => !previewById.has(row.id)) ||
			uniqueSourceNames.size !== included.length
		) {
			return apiError('INVALID_REQUEST', 400);
		}
		const snapshot = await bring.applyAbsolute(
			included.map(({ sourceName, specification }) => ({ sourceName, specification }))
		);
		const appliedArchiveIds = new Set(
			included.flatMap((row) => previewById.get(row.id)?.archiveIds ?? [])
		);
		const appliedDishes = dishes.filter((dish) => appliedArchiveIds.has(dish.archive.id));
		const appliedCycles = appliedDishes.map((dish) => ({
			archiveId: dish.archive.id,
			cycleId: dish.active.cycleId
		}));
		const appliedAt = now().toISOString();
		const batchId = crypto.randomUUID();
		const updateEntry = db.prepare(
			'UPDATE trip_menu_entries SET value = ?, updated_at = ? WHERE id = ? AND trip_id = ?'
		);
		db.transaction(() => {
			for (const dish of appliedDishes) {
				updateEntry.run(
					JSON.stringify(
						serializeMenuActive({
							...dish.active,
							shoppingStatus: { appliedAt, batchId, scope: parsed.data.scope }
						})
					),
					appliedAt,
					dish.entryId,
					tripId
				);
			}
		})();
		return apiSuccess({
			snapshot,
			batchId,
			appliedAt,
			appliedCycles
		});
	} catch (error) {
		return bringError(error);
	}
}
