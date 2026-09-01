import type Database from 'better-sqlite3';
import { z } from 'zod';

import { gearAvailabilityValues } from '$lib/modules/gear/domain/gear';
import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import { activeOwnerIds, canAccessGearItem } from './queries';

export { loadGearPageData } from './queries';

const categoryInputSchema = z
	.object({
		id: z.uuid(),
		name: z.string().trim().min(1).max(100),
		position: z.number().int().nonnegative()
	})
	.strict();
const itemInputSchema = z
	.object({
		id: z.uuid(),
		name: z.string().trim().min(1).max(150),
		categoryId: z.uuid(),
		quantity: z.number().int().positive().max(999),
		ownerIds: z
			.array(z.uuid())
			.max(20)
			.refine((ids) => new Set(ids).size === ids.length),
		availability: z.enum(gearAvailabilityValues),
		notes: z.string().trim().max(500),
		selected: z.boolean()
	})
	.strict();
const selectedSchema = z.object({ selected: z.boolean() }).strict();
const packedSchema = z.object({ packed: z.boolean() }).strict();
const orderSchema = z.object({ categoryIds: z.array(z.uuid()).max(200) }).strict();

export async function handleSaveGearCategory(
	request: Request,
	db: Database.Database,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, categoryInputSchema);
	if (!parsed.success) return apiError('INVALID_GEAR_CATEGORY', 400);
	const timestamp = now().toISOString();
	const existing = db
		.prepare('SELECT created_at FROM gear_categories WHERE id = ?')
		.get(parsed.data.id) as { created_at: string } | undefined;
	if (existing) {
		db.prepare(
			`UPDATE gear_categories SET name = ?, sort_order = ?, archived_at = NULL, updated_at = ?
			 WHERE id = ?`
		).run(parsed.data.name, parsed.data.position, timestamp, parsed.data.id);
	} else {
		db.prepare(
			`INSERT INTO gear_categories
			 (id, name, sort_order, archived_at, created_at, updated_at)
			 VALUES (?, ?, ?, NULL, ?, ?)`
		).run(parsed.data.id, parsed.data.name, parsed.data.position, timestamp, timestamp);
	}
	return apiSuccess({ id: parsed.data.id });
}

export async function handleOrderGearCategories(
	request: Request,
	db: Database.Database,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, orderSchema);
	if (!parsed.success || new Set(parsed.data.categoryIds).size !== parsed.data.categoryIds.length) {
		return apiError('INVALID_CATEGORY_ORDER', 400);
	}
	const current = db
		.prepare('SELECT id FROM gear_categories WHERE archived_at IS NULL ORDER BY id')
		.all() as Array<{ id: string }>;
	if (
		current.length !== parsed.data.categoryIds.length ||
		current.some((row) => !parsed.data.categoryIds.includes(row.id))
	) {
		return apiError('CATEGORY_ORDER_STALE', 409);
	}
	const update = db.prepare(
		'UPDATE gear_categories SET sort_order = ?, updated_at = ? WHERE id = ?'
	);
	const timestamp = now().toISOString();
	db.transaction(() => {
		for (const [position, id] of parsed.data.categoryIds.entries()) {
			update.run(position, timestamp, id);
		}
	})();
	return apiSuccess({ ordered: parsed.data.categoryIds.length });
}

export function handleArchiveGearCategory(db: Database.Database, categoryId: string): Response {
	if (
		db
			.prepare(
				"SELECT 1 FROM gear_items WHERE category_id = ? AND lifecycle_status != 'retired' LIMIT 1"
			)
			.get(categoryId)
	) {
		return apiError('GEAR_CATEGORY_IN_USE', 409);
	}
	const timestamp = new Date().toISOString();
	const result = db
		.prepare('UPDATE gear_categories SET archived_at = ?, updated_at = ? WHERE id = ?')
		.run(timestamp, timestamp, categoryId);
	return result.changes ? apiSuccess({ archived: true }) : apiError('GEAR_CATEGORY_NOT_FOUND', 404);
}

export async function handleSaveGearItem(
	request: Request,
	db: Database.Database,
	tripId: string,
	expectedItemId?: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, itemInputSchema);
	if (!parsed.success) return apiError('INVALID_GEAR_ITEM', 400);
	const input = parsed.data;
	if (expectedItemId && input.id !== expectedItemId) return apiError('GEAR_ITEM_ID_MISMATCH', 400);
	const activeOwners = activeOwnerIds(db, tripId, input.ownerIds);
	if (activeOwners.size !== input.ownerIds.length)
		return apiError('GEAR_OWNER_NOT_TRIP_MEMBER', 409);
	if ((!input.selected || input.availability === 'available') && input.ownerIds.length === 0) {
		return apiError('GEAR_OWNER_REQUIRED', 409);
	}
	if (
		!db
			.prepare('SELECT 1 FROM gear_categories WHERE id = ? AND archived_at IS NULL')
			.get(input.categoryId)
	) {
		return apiError('GEAR_CATEGORY_NOT_FOUND', 404);
	}
	const timestamp = now().toISOString();
	const existing = db.prepare('SELECT id FROM gear_items WHERE id = ?').get(input.id);
	if (existing && !canAccessGearItem(db, tripId, input.id)) {
		return apiError('GEAR_ITEM_NOT_FOUND', 404);
	}
	db.transaction(() => {
		if (existing) {
			db.prepare(
				`UPDATE gear_items SET name = ?, category_id = ?, default_quantity = ?,
				 default_notes = ?, lifecycle_status = 'available', archived_at = NULL, updated_at = ?
				 WHERE id = ?`
			).run(input.name, input.categoryId, input.quantity, input.notes, timestamp, input.id);
		} else {
			db.prepare(
				`INSERT INTO gear_items
				 (id, name, category_id, default_quantity, default_notes, lifecycle_status,
				  archived_at, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 'available', NULL, ?, ?)`
			).run(
				input.id,
				input.name,
				input.categoryId,
				input.quantity,
				input.notes,
				timestamp,
				timestamp
			);
		}
		db.prepare(
			`DELETE FROM gear_item_owners
			 WHERE gear_item_id = ? AND person_id IN (
			   SELECT person_id FROM trip_members WHERE trip_id = ? AND active = 1
			 )`
		).run(input.id, tripId);
		const insertOwner = db.prepare(
			`INSERT INTO gear_item_owners (gear_item_id, person_id, ownership_role)
			 VALUES (?, ?, 'owner') ON CONFLICT(gear_item_id, person_id) DO NOTHING`
		);
		for (const ownerId of input.ownerIds) insertOwner.run(input.id, ownerId);
		const tripItem = db
			.prepare('SELECT added_at FROM trip_gear_items WHERE trip_id = ? AND gear_item_id = ?')
			.get(tripId, input.id) as { added_at: string } | undefined;
		if (tripItem) {
			db.prepare(
				`UPDATE trip_gear_items SET quantity_override = ?, availability = ?, trip_notes = ?,
				 owner_resolution = 'current', active = ?, updated_at = ?
				 WHERE trip_id = ? AND gear_item_id = ?`
			).run(
				input.quantity,
				input.availability,
				input.notes,
				input.selected ? 1 : 0,
				timestamp,
				tripId,
				input.id
			);
		} else if (input.selected) {
			db.prepare(
				`INSERT INTO trip_gear_items
				 (trip_id, gear_item_id, quantity_override, availability, trip_notes,
				  owner_resolution, active, added_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 'current', 1, ?, ?)`
			).run(
				tripId,
				input.id,
				input.quantity,
				input.availability,
				input.notes,
				timestamp,
				timestamp
			);
		}
		if (input.selected) {
			db.prepare(
				`INSERT INTO trip_gear_packing
				 (trip_id, gear_item_id, packed, packed_at, packed_by_person_id)
				 VALUES (?, ?, 0, NULL, NULL)
				 ON CONFLICT(trip_id, gear_item_id) DO NOTHING`
			).run(tripId, input.id);
		} else if (tripItem) {
			db.prepare(
				`UPDATE trip_gear_packing SET packed = 0, packed_at = NULL, packed_by_person_id = NULL
				 WHERE trip_id = ? AND gear_item_id = ?`
			).run(tripId, input.id);
		}
	})();
	return apiSuccess({ id: input.id, selected: input.selected });
}

export function handleArchiveGearItem(
	db: Database.Database,
	tripId: string,
	itemId: string
): Response {
	if (!canAccessGearItem(db, tripId, itemId)) return apiError('GEAR_ITEM_NOT_FOUND', 404);
	if (
		db
			.prepare('SELECT 1 FROM trip_gear_items WHERE gear_item_id = ? AND active = 1 LIMIT 1')
			.get(itemId)
	) {
		return apiError('GEAR_ITEM_IN_USE', 409);
	}
	const timestamp = new Date().toISOString();
	const result = db
		.prepare(
			`UPDATE gear_items SET lifecycle_status = 'retired', archived_at = ?, updated_at = ?
			 WHERE id = ?`
		)
		.run(timestamp, timestamp, itemId);
	return result.changes ? apiSuccess({ archived: true }) : apiError('GEAR_ITEM_NOT_FOUND', 404);
}

export async function handleGearSelection(
	request: Request,
	db: Database.Database,
	tripId: string,
	itemId: string
): Promise<Response> {
	const parsed = await parseJsonRequest(request, selectedSchema);
	if (!parsed.success) return apiError('INVALID_GEAR_SELECTION', 400);
	const item = db
		.prepare('SELECT default_quantity, default_notes FROM gear_items WHERE id = ?')
		.get(itemId) as { default_quantity: number; default_notes: string } | undefined;
	if (!item) return apiError('GEAR_ITEM_NOT_FOUND', 404);
	if (parsed.data.selected && !canAccessGearItem(db, tripId, itemId)) {
		return apiError('GEAR_ITEM_NOT_FOUND', 404);
	}
	const timestamp = new Date().toISOString();
	db.transaction(() => {
		db.prepare(
			`INSERT INTO trip_gear_items
			 (trip_id, gear_item_id, quantity_override, availability, trip_notes,
			  owner_resolution, active, added_at, updated_at)
			 VALUES (?, ?, ?, 'available', ?, 'current', ?, ?, ?)
			 ON CONFLICT(trip_id, gear_item_id) DO UPDATE SET
			   active = excluded.active, owner_resolution = 'current', updated_at = excluded.updated_at`
		).run(
			tripId,
			itemId,
			item.default_quantity,
			item.default_notes,
			parsed.data.selected ? 1 : 0,
			timestamp,
			timestamp
		);
		db.prepare(
			`INSERT INTO trip_gear_packing
			 (trip_id, gear_item_id, packed, packed_at, packed_by_person_id)
			 VALUES (?, ?, 0, NULL, NULL)
			 ON CONFLICT(trip_id, gear_item_id) DO UPDATE SET
			   packed = 0, packed_at = NULL, packed_by_person_id = NULL`
		).run(tripId, itemId);
	})();
	return apiSuccess({ selected: parsed.data.selected });
}

export async function handleGearPacking(
	request: Request,
	db: Database.Database,
	tripId: string,
	itemId: string
): Promise<Response> {
	const parsed = await parseJsonRequest(request, packedSchema);
	if (!parsed.success) return apiError('INVALID_GEAR_PACKING', 400);
	const item = db
		.prepare(
			`SELECT selected.availability, selected.owner_resolution,
			        (SELECT COUNT(*) FROM gear_item_owners owner
			         WHERE owner.gear_item_id = selected.gear_item_id) AS owner_count,
			        (SELECT COUNT(*) FROM gear_item_owners owner
			         JOIN trip_members member ON member.trip_id = selected.trip_id
			          AND member.person_id = owner.person_id AND member.active = 1
			         WHERE owner.gear_item_id = selected.gear_item_id) AS active_owner_count
			 FROM trip_gear_items selected
			 WHERE selected.trip_id = ? AND selected.gear_item_id = ? AND selected.active = 1`
		)
		.get(tripId, itemId) as
		| {
				availability: string;
				owner_resolution: string;
				owner_count: number;
				active_owner_count: number;
		  }
		| undefined;
	if (!item || item.availability !== 'available') return apiError('GEAR_ITEM_NOT_PACKABLE', 409);
	if (
		item.owner_count > 0 &&
		item.active_owner_count === 0 &&
		item.owner_resolution !== 'retained'
	) {
		return apiError('GEAR_OWNER_RESOLUTION_REQUIRED', 409);
	}
	const timestamp = new Date().toISOString();
	db.prepare(
		`INSERT INTO trip_gear_packing
		 (trip_id, gear_item_id, packed, packed_at, packed_by_person_id)
		 VALUES (?, ?, ?, ?, NULL)
		 ON CONFLICT(trip_id, gear_item_id) DO UPDATE SET
		   packed = excluded.packed, packed_at = excluded.packed_at`
	).run(tripId, itemId, parsed.data.packed ? 1 : 0, parsed.data.packed ? timestamp : null);
	return apiSuccess({ packed: parsed.data.packed });
}

export function handleRetainGearItem(
	db: Database.Database,
	tripId: string,
	itemId: string
): Response {
	const result = db
		.prepare(
			`UPDATE trip_gear_items SET owner_resolution = 'retained', updated_at = ?
			 WHERE trip_id = ? AND gear_item_id = ? AND active = 1`
		)
		.run(new Date().toISOString(), tripId, itemId);
	return result.changes ? apiSuccess({ retained: true }) : apiError('GEAR_ITEM_NOT_FOUND', 404);
}
