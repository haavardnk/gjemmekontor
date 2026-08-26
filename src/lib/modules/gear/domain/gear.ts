import { z } from 'zod';

import type { JsonValue } from '$lib/client/database';

export const gearAvailabilityValues = ['available', 'need-to-buy'] as const;
export type GearAvailability = (typeof gearAvailabilityValues)[number];

const createdFields = {
	createdAt: z.iso.datetime(),
	createdBy: z.string().min(1).max(128),
	tombstone: z.boolean()
};

export const gearOwnerSchema = z
	.object({
		version: z.literal(1),
		id: z.uuid(),
		name: z.string().trim().min(1).max(100),
		...createdFields
	})
	.strict();

export const gearCategorySchema = z
	.object({
		version: z.literal(1),
		id: z.uuid(),
		name: z.string().trim().min(1).max(100),
		position: z.number().int().nonnegative().safe(),
		...createdFields
	})
	.strict();

export const gearItemSchema = z
	.object({
		version: z.literal(1),
		id: z.uuid(),
		categoryId: z.uuid(),
		name: z.string().trim().min(1).max(150),
		quantity: z.number().int().positive().max(999),
		ownerId: z.uuid().optional(),
		availability: z.enum(gearAvailabilityValues),
		notes: z.string().trim().max(500),
		...createdFields
	})
	.strict();

export type GearOwner = z.infer<typeof gearOwnerSchema>;
export type GearCategory = z.infer<typeof gearCategorySchema>;
export type GearItem = z.infer<typeof gearItemSchema>;
export type KeyedGearOwner = GearOwner & { key: string };
export type KeyedGearCategory = GearCategory & { key: string };
export type KeyedGearItem = GearItem & { key: string };
export type GearItemSort = 'name' | 'owner' | 'availability' | 'unpacked';

const ownerPrefix = 'gear:owner:';
const categoryPrefix = 'gear:category:';
const itemPrefix = 'gear:item:';
const packedPrefix = 'gear:packed:';
const norwegianCollator = new Intl.Collator('nb-NO', { sensitivity: 'base' });

export function gearOwnerKey(id: string): string {
	return `${ownerPrefix}${id}`;
}

export function gearCategoryKey(id: string): string {
	return `${categoryPrefix}${id}`;
}

export function gearItemKey(id: string): string {
	return `${itemPrefix}${id}`;
}

export function gearPackedKey(itemId: string): string {
	return `${packedPrefix}${itemId}`;
}

export function gearOwners(values: Record<string, JsonValue>): KeyedGearOwner[] {
	return Object.entries(values)
		.filter(([key]) => key.startsWith(ownerPrefix))
		.flatMap(([key, value]) => {
			const parsed = gearOwnerSchema.safeParse(value);
			return parsed.success && !parsed.data.tombstone && key === gearOwnerKey(parsed.data.id)
				? [{ key, ...parsed.data }]
				: [];
		})
		.sort(
			(left, right) =>
				norwegianCollator.compare(left.name, right.name) || left.id.localeCompare(right.id)
		);
}

export function gearCategories(values: Record<string, JsonValue>): KeyedGearCategory[] {
	return Object.entries(values)
		.filter(([key]) => key.startsWith(categoryPrefix))
		.flatMap(([key, value]) => {
			const parsed = gearCategorySchema.safeParse(value);
			return parsed.success && !parsed.data.tombstone && key === gearCategoryKey(parsed.data.id)
				? [{ key, ...parsed.data }]
				: [];
		})
		.sort(
			(left, right) =>
				left.position - right.position ||
				norwegianCollator.compare(left.name, right.name) ||
				left.id.localeCompare(right.id)
		);
}

export function gearItems(values: Record<string, JsonValue>): KeyedGearItem[] {
	return Object.entries(values)
		.filter(([key]) => key.startsWith(itemPrefix))
		.flatMap(([key, value]) => {
			const parsed = gearItemSchema.safeParse(value);
			return parsed.success && !parsed.data.tombstone && key === gearItemKey(parsed.data.id)
				? [{ key, ...parsed.data }]
				: [];
		})
		.sort(
			(left, right) =>
				norwegianCollator.compare(left.name, right.name) || left.id.localeCompare(right.id)
		);
}

export function isGearItemPacked(values: Record<string, JsonValue>, itemId: string): boolean {
	return values[gearPackedKey(itemId)] === true;
}

export function gearProgress(
	items: readonly GearItem[],
	values: Record<string, JsonValue>
): { packed: number; total: number; needToBuy: number } {
	const available = items.filter((item) => item.availability === 'available');
	return {
		packed: available.filter((item) => isGearItemPacked(values, item.id)).length,
		total: available.length,
		needToBuy: items.length - available.length
	};
}

export function filterGearItems(
	items: readonly KeyedGearItem[],
	options: {
		query?: string;
		ownerId?: string;
		availability?: GearAvailability;
		categoryNames?: ReadonlyMap<string, string>;
		ownerNames?: ReadonlyMap<string, string>;
	}
): KeyedGearItem[] {
	const query = options.query?.trim().toLocaleLowerCase('nb-NO') ?? '';
	return items.filter((item) => {
		if (options.ownerId && item.ownerId !== options.ownerId) return false;
		if (options.availability && item.availability !== options.availability) return false;
		if (!query) return true;
		const categoryName = options.categoryNames?.get(item.categoryId) ?? '';
		const ownerName = item.ownerId ? (options.ownerNames?.get(item.ownerId) ?? '') : '';
		return `${item.name} ${item.notes} ${categoryName} ${ownerName}`
			.toLocaleLowerCase('nb-NO')
			.includes(query);
	});
}

export function sortGearItems(
	items: readonly KeyedGearItem[],
	sort: GearItemSort,
	values: Record<string, JsonValue>,
	ownerNames: ReadonlyMap<string, string>
): KeyedGearItem[] {
	return [...items].sort((left, right) => {
		if (sort === 'owner') {
			const ownerComparison = norwegianCollator.compare(
				left.ownerId ? (ownerNames.get(left.ownerId) ?? '') : '',
				right.ownerId ? (ownerNames.get(right.ownerId) ?? '') : ''
			);
			if (ownerComparison) return ownerComparison;
		}
		if (sort === 'availability') {
			const availabilityComparison =
				Number(left.availability === 'available') - Number(right.availability === 'available');
			if (availabilityComparison) return availabilityComparison;
		}
		if (sort === 'unpacked') {
			const packedComparison =
				Number(isGearItemPacked(values, left.id)) - Number(isGearItemPacked(values, right.id));
			if (packedComparison) return packedComparison;
		}
		return norwegianCollator.compare(left.name, right.name) || left.id.localeCompare(right.id);
	});
}

export function repositionGearCategory(
	categories: readonly KeyedGearCategory[],
	categoryId: string,
	targetIndex: number
): GearCategory[] {
	const sourceIndex = categories.findIndex((category) => category.id === categoryId);
	if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= categories.length) {
		return categories.map(toGearCategory);
	}
	const reordered = categories.map(toGearCategory);
	const [moved] = reordered.splice(sourceIndex, 1);
	if (!moved) return reordered;
	reordered.splice(targetIndex, 0, moved);
	return reordered.map((category, position) => ({ ...category, position }));
}

function toGearCategory(category: GearCategory): GearCategory {
	return {
		version: category.version,
		id: category.id,
		name: category.name,
		position: category.position,
		createdAt: category.createdAt,
		createdBy: category.createdBy,
		tombstone: category.tombstone
	};
}

export function serializeGearOwner(owner: GearOwner): JsonValue {
	return {
		version: owner.version,
		id: owner.id,
		name: owner.name,
		createdAt: owner.createdAt,
		createdBy: owner.createdBy,
		tombstone: owner.tombstone
	};
}

export function serializeGearCategory(category: GearCategory): JsonValue {
	return {
		version: category.version,
		id: category.id,
		name: category.name,
		position: category.position,
		createdAt: category.createdAt,
		createdBy: category.createdBy,
		tombstone: category.tombstone
	};
}

export function serializeGearItem(item: GearItem): JsonValue {
	return {
		version: item.version,
		id: item.id,
		categoryId: item.categoryId,
		name: item.name,
		quantity: item.quantity,
		...(item.ownerId ? { ownerId: item.ownerId } : {}),
		availability: item.availability,
		notes: item.notes,
		createdAt: item.createdAt,
		createdBy: item.createdBy,
		tombstone: item.tombstone
	};
}
