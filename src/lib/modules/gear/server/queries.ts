import type Database from 'better-sqlite3';

import type {
	GearCategory,
	GearItemView,
	GearPageData,
	GearPersonView
} from '$lib/modules/gear/domain/gear';

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

export function activeOwnerIds(
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

export function canAccessGearItem(db: Database.Database, tripId: string, itemId: string): boolean {
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
