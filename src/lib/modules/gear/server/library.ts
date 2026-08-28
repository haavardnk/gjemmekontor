import type Database from 'better-sqlite3';
import { z } from 'zod';

import {
	gearAvailabilityValues,
	type GearCategory,
	type GearItemView,
	type GearPageData,
	type GearPersonView
} from '$lib/modules/gear/domain/gear';
import { apiError, apiSuccess } from '$lib/server/api';

type ItemRow = {
	id: string;
	name: string;
	category_id: string | null;
	quantity: number;
	notes: string;
	availability: 'available' | 'need-to-buy';
	selected: number;
	packed: number;
	owner_resolution: 'current' | 'retained';
};

type OwnerRow = { gear_item_id: string; person_id: string; name: string; active_member: number };

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

async function requestJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

function ownersByItem(db: Database.Database, tripId: string, itemIds: readonly string[]) {
	const result = new Map<string, GearPersonView[]>();
	if (!itemIds.length) return result;
	const placeholders = itemIds.map(() => '?').join(', ');
	const rows = db
		.prepare(
			`SELECT owner.gear_item_id, p.id AS person_id,
			        p.display_name AS name,
			        CASE WHEN member.active = 1 THEN 1 ELSE 0 END AS active_member
			 FROM gear_item_owners owner
			 JOIN people p ON p.id = owner.person_id
			 LEFT JOIN trip_members member
			   ON member.trip_id = ? AND member.person_id = p.id
			 WHERE owner.gear_item_id IN (${placeholders})
			 ORDER BY p.display_name COLLATE NOCASE, p.id`
		)
		.all(tripId, ...itemIds) as OwnerRow[];
	for (const row of rows) {
		const owners = result.get(row.gear_item_id) ?? [];
		owners.push({ id: row.person_id, name: row.name, activeTripMember: row.active_member === 1 });
		result.set(row.gear_item_id, owners);
	}
	return result;
}

export function loadGearPageData(db: Database.Database, tripId: string): GearPageData {
	const categoryRows = db
		.prepare(
			`SELECT id, name, sort_order
				 FROM gear_categories WHERE archived_at IS NULL
				 ORDER BY sort_order, name COLLATE NOCASE, id`
		)
		.all() as Array<{ id: string; name: string; sort_order: number }>;
	const categories: GearCategory[] = categoryRows.map((row) => ({
		id: row.id,
		name: row.name,
		position: row.sort_order
	}));
	const rows = db
		.prepare(
			`SELECT item.id, item.name, item.category_id,
			        COALESCE(trip_item.quantity_override, item.default_quantity) AS quantity,
			        COALESCE(trip_item.trip_notes, item.default_notes) AS notes,
			        COALESCE(trip_item.availability, 'available') AS availability,
			        COALESCE(trip_item.active, 0) AS selected,
			        COALESCE(packing.packed, 0) AS packed,
				        COALESCE(trip_item.owner_resolution, 'current') AS owner_resolution
			 FROM gear_items item
			 LEFT JOIN trip_gear_items trip_item
			   ON trip_item.trip_id = ? AND trip_item.gear_item_id = item.id
			 LEFT JOIN trip_gear_packing packing
			   ON packing.trip_id = trip_item.trip_id AND packing.gear_item_id = item.id
			 WHERE trip_item.active = 1 OR (
			   item.lifecycle_status = 'available' AND item.archived_at IS NULL AND EXISTS (
			     SELECT 1 FROM gear_item_owners owner
			     JOIN trip_members member
			       ON member.trip_id = ? AND member.person_id = owner.person_id AND member.active = 1
			     WHERE owner.gear_item_id = item.id
			   )
			 )
			 ORDER BY item.name COLLATE NOCASE, item.id`
		)
		.all(tripId, tripId) as ItemRow[];
	const ownerMap = ownersByItem(
		db,
		tripId,
		rows.map((row) => row.id)
	);
	const items: GearItemView[] = rows.flatMap((row) => {
		if (!row.category_id) return [];
		const owners = ownerMap.get(row.id) ?? [];
		const activeOwners = owners.filter((owner) => owner.activeTripMember);
		const needsOwnerResolution =
			row.selected === 1 && owners.length > 0 && activeOwners.length === 0;
		return [
			{
				id: row.id,
				categoryId: row.category_id,
				name: row.name,
				quantity: row.quantity,
				ownerIds: owners.map((owner) => owner.id),
				availability: row.availability,
				notes: row.notes,
				selected: row.selected === 1,
				packed: row.packed === 1,
				needsOwnerResolution,
				retainedWithoutCurrentOwner: needsOwnerResolution && row.owner_resolution === 'retained'
			}
		];
	});
	const activeMembers = db
		.prepare(
			`SELECT p.id, COALESCE(member.trip_label, p.display_name) AS name
			 FROM trip_members member JOIN people p ON p.id = member.person_id
			 WHERE member.trip_id = ? AND member.active = 1
			 ORDER BY member.sort_order, p.display_name COLLATE NOCASE`
		)
		.all(tripId) as Array<{ id: string; name: string }>;
	const peopleById = new Map<string, GearPersonView>(
		activeMembers.map((person) => [person.id, { ...person, activeTripMember: true }])
	);
	for (const owners of ownerMap.values()) {
		for (const owner of owners) peopleById.set(owner.id, owner);
	}
	return { people: [...peopleById.values()], categories, items };
}

function activeOwnerIds(
	db: Database.Database,
	tripId: string,
	ownerIds: readonly string[]
): Set<string> {
	if (!ownerIds.length) return new Set();
	const placeholders = ownerIds.map(() => '?').join(', ');
	const rows = db
		.prepare(
			`SELECT person_id FROM trip_members
			 WHERE trip_id = ? AND active = 1 AND person_id IN (${placeholders})`
		)
		.all(tripId, ...ownerIds) as Array<{ person_id: string }>;
	return new Set(rows.map((row) => row.person_id));
}

function canAccessGearItem(db: Database.Database, tripId: string, itemId: string): boolean {
	return Boolean(
		db
			.prepare(
				`SELECT 1
				 FROM gear_items item
				 WHERE item.id = ? AND (
				   EXISTS (
				     SELECT 1 FROM trip_gear_items selected
				     WHERE selected.trip_id = ? AND selected.gear_item_id = item.id
				   ) OR EXISTS (
				     SELECT 1 FROM gear_item_owners owner
				     JOIN trip_members member
				       ON member.trip_id = ? AND member.person_id = owner.person_id AND member.active = 1
				     WHERE owner.gear_item_id = item.id
				   )
				 )`
			)
			.get(itemId, tripId, tripId)
	);
}

export async function handleSaveGearCategory(
	request: Request,
	db: Database.Database,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = categoryInputSchema.safeParse(await requestJson(request));
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
	const parsed = orderSchema.safeParse(await requestJson(request));
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
	const parsed = itemInputSchema.safeParse(await requestJson(request));
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
	const parsed = selectedSchema.safeParse(await requestJson(request));
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
	const parsed = packedSchema.safeParse(await requestJson(request));
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
