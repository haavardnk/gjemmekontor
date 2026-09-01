import { z } from 'zod';

export const gearAvailabilityValues = ['available', 'need-to-buy'] as const;
export type GearAvailability = (typeof gearAvailabilityValues)[number];

export type GearCategory = {
	id: string;
	name: string;
	position: number;
};
export type GearPersonView = { id: string; name: string; activeTripMember: boolean };
export type GearItemView = {
	id: string;
	categoryId: string;
	name: string;
	quantity: number;
	ownerIds: string[];
	availability: GearAvailability;
	notes: string;
	selected: boolean;
	packed: boolean;
	needsOwnerResolution: boolean;
	retainedWithoutCurrentOwner: boolean;
};
export type GearPageData = {
	people: GearPersonView[];
	categories: GearCategory[];
	items: GearItemView[];
};

export const gearPageDataSchema = z.object({
	people: z.array(
		z.object({ id: z.uuid(), name: z.string(), activeTripMember: z.boolean() }).strict()
	),
	categories: z.array(
		z.object({ id: z.uuid(), name: z.string(), position: z.number().int().nonnegative() }).strict()
	),
	items: z.array(
		z
			.object({
				id: z.uuid(),
				categoryId: z.uuid(),
				name: z.string(),
				quantity: z.number().int().positive(),
				ownerIds: z.array(z.uuid()),
				availability: z.enum(gearAvailabilityValues),
				notes: z.string(),
				selected: z.boolean(),
				packed: z.boolean(),
				needsOwnerResolution: z.boolean(),
				retainedWithoutCurrentOwner: z.boolean()
			})
			.strict()
	)
});
export type GearItemSort = 'name' | 'category' | 'owner' | 'availability' | 'unpacked';

const norwegianCollator = new Intl.Collator('nb-NO', { sensitivity: 'base' });

export function gearProgress(items: readonly GearItemView[]): {
	packed: number;
	total: number;
	needToBuy: number;
} {
	const available = items.filter((item) => item.availability === 'available');
	return {
		packed: available.filter((item) => item.packed).length,
		total: available.length,
		needToBuy: items.length - available.length
	};
}

export function filterGearItems<T extends GearItemView>(
	items: readonly T[],
	options: {
		query?: string;
		ownerId?: string;
		availability?: GearAvailability;
		categoryId?: string;
		planned?: boolean;
		categoryNames?: ReadonlyMap<string, string>;
		ownerNames?: ReadonlyMap<string, string>;
	}
): T[] {
	const query = options.query?.trim().toLocaleLowerCase('nb-NO') ?? '';
	return items.filter((item) => {
		if (options.ownerId && !item.ownerIds.includes(options.ownerId)) return false;
		if (options.availability && item.availability !== options.availability) return false;
		if (options.categoryId && item.categoryId !== options.categoryId) return false;
		if (options.planned !== undefined && item.selected !== options.planned) return false;
		if (!query) return true;
		const categoryName = options.categoryNames?.get(item.categoryId) ?? '';
		const ownerName = item.ownerIds
			.map((ownerId) => options.ownerNames?.get(ownerId) ?? '')
			.join(' ');
		return `${item.name} ${item.notes} ${categoryName} ${ownerName}`
			.toLocaleLowerCase('nb-NO')
			.includes(query);
	});
}

export function sortGearItems<T extends GearItemView>(
	items: readonly T[],
	sort: GearItemSort,
	ownerNames: ReadonlyMap<string, string>,
	categoryNames: ReadonlyMap<string, string> = new Map()
): T[] {
	return [...items].sort((left, right) => {
		if (sort === 'category') {
			const categoryComparison = norwegianCollator.compare(
				categoryNames.get(left.categoryId) ?? '',
				categoryNames.get(right.categoryId) ?? ''
			);
			if (categoryComparison) return categoryComparison;
		}
		if (sort === 'owner') {
			const ownerComparison = norwegianCollator.compare(
				left.ownerIds.map((id) => ownerNames.get(id) ?? '').join(', '),
				right.ownerIds.map((id) => ownerNames.get(id) ?? '').join(', ')
			);
			if (ownerComparison) return ownerComparison;
		}
		if (sort === 'availability') {
			const availabilityComparison =
				Number(left.availability === 'available') - Number(right.availability === 'available');
			if (availabilityComparison) return availabilityComparison;
		}
		if (sort === 'unpacked') {
			const packedComparison = Number(left.packed) - Number(right.packed);
			if (packedComparison) return packedComparison;
		}
		return norwegianCollator.compare(left.name, right.name) || left.id.localeCompare(right.id);
	});
}

export function repositionGearCategory(
	categories: readonly GearCategory[],
	categoryId: string,
	targetIndex: number
): GearCategory[] {
	const sourceIndex = categories.findIndex((category) => category.id === categoryId);
	if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= categories.length) {
		return [...categories];
	}
	const reordered = [...categories];
	const [moved] = reordered.splice(sourceIndex, 1);
	if (!moved) return reordered;
	reordered.splice(targetIndex, 0, moved);
	return reordered.map((category, position) => ({ ...category, position }));
}
