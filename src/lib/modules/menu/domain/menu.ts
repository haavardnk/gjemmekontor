import { z } from 'zod';

import type { JsonValue } from '$lib/client/database';

export const mealCategories = ['breakfast', 'lunch', 'dinner'] as const;
export type MealCategory = (typeof mealCategories)[number];

const httpsUrlSchema = z
	.url()
	.max(2_048)
	.refine((value) => new URL(value).protocol === 'https:');

export const rationalSchema = z
	.object({
		numerator: z.number().int().safe(),
		denominator: z.number().int().positive().safe()
	})
	.strict();

export const menuIngredientSchema = z
	.object({
		id: z.uuid(),
		group: z.string().trim().max(100),
		quantityText: z.string().trim().max(100),
		normalizedQuantity: rationalSchema.optional(),
		unit: z.string().trim().max(40),
		name: z.string().trim().min(1).max(200),
		note: z.string().trim().max(300)
	})
	.strict();

export const menuInstructionSchema = z
	.object({
		id: z.uuid(),
		section: z.string().trim().max(100),
		text: z.string().trim().min(1).max(4_000)
	})
	.strict();

export const menuArchiveSchema = z
	.object({
		version: z.literal(1),
		id: z.uuid(),
		name: z.string().trim().min(1).max(200),
		sourceUrl: httpsUrlSchema.optional(),
		imageUrl: httpsUrlSchema.optional(),
		sourceYield: z.string().trim().max(100).optional(),
		baseServings: z.number().int().positive().max(500),
		defaultPlannedServings: z.number().int().positive().max(500),
		ingredients: z.array(menuIngredientSchema).max(250),
		instructions: z.array(menuInstructionSchema).max(200),
		createdAt: z.iso.datetime(),
		createdBy: z.string().min(1).max(128),
		tombstone: z.boolean()
	})
	.strict()
	.refine(
		(value) =>
			value.instructions.reduce((total, instruction) => total + instruction.text.length, 0) <=
			50_000,
		{ message: 'Instructions are too large', path: ['instructions'] }
	);

export const menuShoppingStatusSchema = z
	.object({
		appliedAt: z.iso.datetime(),
		batchId: z.uuid(),
		scope: z.enum(['dish', 'menu'])
	})
	.strict();

const menuCategoryOrderSchema = z
	.object({
		breakfast: z.number().int().nonnegative().safe().optional(),
		lunch: z.number().int().nonnegative().safe().optional(),
		dinner: z.number().int().nonnegative().safe().optional()
	})
	.strict();

export const menuActiveSchema = z
	.object({
		version: z.literal(1),
		archiveId: z.uuid(),
		cycleId: z.uuid(),
		categories: z.array(z.enum(mealCategories)).min(1).max(3),
		plannedServings: z.number().int().positive().max(500),
		activatedAt: z.iso.datetime(),
		activatedBy: z.string().min(1).max(128),
		categoryOrder: menuCategoryOrderSchema.optional(),
		shoppingStatus: menuShoppingStatusSchema.optional(),
		tombstone: z.boolean()
	})
	.strict()
	.refine((value) => new Set(value.categories).size === value.categories.length, {
		message: 'Categories must be unique',
		path: ['categories']
	});

export type Rational = z.infer<typeof rationalSchema>;
export type MenuIngredient = z.infer<typeof menuIngredientSchema>;
export type MenuInstruction = z.infer<typeof menuInstructionSchema>;
export type MenuArchive = z.infer<typeof menuArchiveSchema>;
export type MenuActive = z.infer<typeof menuActiveSchema>;
export type MenuShoppingStatus = z.infer<typeof menuShoppingStatusSchema>;
export type CurrentDish = { archive: MenuArchive; active: MenuActive };
export type RecipeArchiveView = MenuArchive & {
	recipeVersionId: string;
	recipeVersion: number;
};
export type TripMenuDish = {
	archive: RecipeArchiveView;
	active: MenuActive;
	entryId: string;
	latestRecipeVersion: number;
};
export type MenuPageData = { archives: RecipeArchiveView[]; dishes: TripMenuDish[] };
export type MenuEditorValue = {
	name: string;
	sourceUrl?: string;
	imageUrl?: string;
	sourceYield?: string;
	baseServings: number;
	defaultPlannedServings: number;
	plannedServings: number;
	categories: MealCategory[];
	ingredients: MenuIngredient[];
	instructions: MenuInstruction[];
};

export const recipeArchiveViewSchema = menuArchiveSchema.safeExtend({
	recipeVersionId: z.string().min(1),
	recipeVersion: z.number().int().positive()
});

export const tripMenuDishSchema = z
	.object({
		archive: recipeArchiveViewSchema,
		active: menuActiveSchema,
		entryId: z.uuid(),
		latestRecipeVersion: z.number().int().positive()
	})
	.strict();

export const menuPageDataSchema = z
	.object({
		archives: z.array(recipeArchiveViewSchema),
		dishes: z.array(tripMenuDishSchema)
	})
	.strict();

const norwegianCollator = new Intl.Collator('nb-NO', { sensitivity: 'base' });

export function dishInCategory(dish: CurrentDish, category: MealCategory): boolean {
	return dish.active.categories.includes(category);
}

export function orderedDishesInCategory<T extends CurrentDish>(
	dishes: readonly T[],
	category: MealCategory
): T[] {
	return dishes
		.filter((dish) => dishInCategory(dish, category))
		.sort((left, right) => {
			const leftOrder = left.active.categoryOrder?.[category] ?? Number.MAX_SAFE_INTEGER;
			const rightOrder = right.active.categoryOrder?.[category] ?? Number.MAX_SAFE_INTEGER;
			return (
				leftOrder - rightOrder ||
				norwegianCollator.compare(left.archive.name, right.archive.name) ||
				left.archive.id.localeCompare(right.archive.id)
			);
		});
}

function orderedCategories(categories: Iterable<MealCategory>): MealCategory[] {
	const selected = new Set(categories);
	return mealCategories.filter((category) => selected.has(category));
}

export function moveDishCategory(
	active: MenuActive,
	from: MealCategory,
	to: MealCategory
): MenuActive {
	if (!active.categories.includes(from) || active.categories.includes(to)) {
		throw new Error('INVALID_CATEGORY_MOVE');
	}
	return {
		...active,
		categories: orderedCategories(
			active.categories.filter((category) => category !== from).concat(to)
		)
	};
}

export function consumeDishCategory(active: MenuActive, category: MealCategory): MenuActive {
	if (!active.categories.includes(category)) {
		throw new Error('INVALID_CATEGORY_CONSUMPTION');
	}
	const categories = active.categories.filter((selected) => selected !== category);
	return categories.length > 0 ? { ...active, categories } : { ...active, tombstone: true };
}

export function reactivateDish(
	archiveId: string,
	categories: readonly MealCategory[],
	plannedServings: number,
	activatedAt: string,
	activatedBy: string,
	cycleId: string
): MenuActive {
	return menuActiveSchema.parse({
		version: 1,
		archiveId,
		cycleId,
		categories: orderedCategories(categories),
		plannedServings,
		activatedAt,
		activatedBy,
		tombstone: false
	});
}

export function normalizedDishName(name: string): string {
	return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

export function normalizedSourceUrl(value: string): string | undefined {
	try {
		const url = new URL(value.trim());
		if (url.protocol !== 'https:') return undefined;
		url.hash = '';
		url.hostname = url.hostname.toLocaleLowerCase('en-US');
		return url.toString();
	} catch {
		return undefined;
	}
}

export function matchingArchives(
	archives: readonly MenuArchive[],
	name: string,
	sourceUrl?: string
): MenuArchive[] {
	const normalizedName = normalizedDishName(name);
	const normalizedUrl = sourceUrl ? normalizedSourceUrl(sourceUrl) : undefined;
	return archives.filter(
		(archive) =>
			normalizedDishName(archive.name) === normalizedName ||
			(Boolean(normalizedUrl) && normalizedSourceUrl(archive.sourceUrl ?? '') === normalizedUrl)
	);
}

export function serializeMenuArchive(archive: MenuArchive): JsonValue {
	return menuArchiveSchema.parse(archive) as JsonValue;
}

export function serializeMenuActive(active: MenuActive): JsonValue {
	return menuActiveSchema.parse(active) as JsonValue;
}
