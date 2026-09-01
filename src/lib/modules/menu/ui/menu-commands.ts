import type { OfflineResourceMutation } from '$lib/client/offline-resource';

import {
	consumeDishCategory,
	type MealCategory,
	type MenuActive,
	menuActiveSchema,
	type MenuArchive,
	menuArchiveSchema,
	type MenuEditorValue,
	type MenuPageData,
	moveDishCategory,
	orderedDishesInCategory,
	reactivateDish,
	type RecipeArchiveView,
	serializeMenuActive,
	type TripMenuDish
} from '../domain/menu';

export type MenuMutation = OfflineResourceMutation<MenuPageData>;

export type MenuEditingContext = {
	archive?: RecipeArchiveView;
	active?: MenuActive;
	entryId?: string;
	activateOnSave: boolean;
	initial: MenuEditorValue;
};

export type MenuCommandIdentity = {
	clientId: string;
	now: string;
	randomId: () => string;
};

export function emptyMenuEditor(): MenuEditorValue {
	return {
		name: '',
		baseServings: 4,
		defaultPlannedServings: 4,
		plannedServings: 4,
		categories: ['dinner'],
		ingredients: [],
		instructions: []
	};
}

export function menuEditorFor(archive: RecipeArchiveView, active?: MenuActive): MenuEditorValue {
	return {
		name: archive.name,
		...(archive.sourceUrl ? { sourceUrl: archive.sourceUrl } : {}),
		...(archive.imageUrl ? { imageUrl: archive.imageUrl } : {}),
		...(archive.sourceYield ? { sourceYield: archive.sourceYield } : {}),
		baseServings: archive.baseServings,
		defaultPlannedServings: archive.defaultPlannedServings,
		plannedServings: active?.plannedServings ?? archive.defaultPlannedServings,
		categories: active?.categories ?? ['dinner'],
		ingredients: archive.ingredients,
		instructions: archive.instructions
	};
}

export function saveMenuEditor(
	data: MenuPageData,
	context: MenuEditingContext,
	value: MenuEditorValue,
	identity: MenuCommandIdentity
): MenuMutation {
	const id = context.archive?.id ?? identity.randomId();
	const archive = menuArchiveSchema.parse({
		version: 1,
		id,
		name: value.name,
		...(value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}),
		...(value.imageUrl ? { imageUrl: value.imageUrl } : {}),
		...(value.sourceYield ? { sourceYield: value.sourceYield } : {}),
		baseServings: value.baseServings,
		defaultPlannedServings: value.defaultPlannedServings,
		ingredients: value.ingredients,
		instructions: value.instructions,
		createdAt: context.archive?.createdAt ?? identity.now,
		createdBy: context.archive?.createdBy ?? identity.clientId,
		tombstone: false
	});
	const active = context.active
		? menuActiveSchema.parse({
				version: 1,
				archiveId: id,
				cycleId: context.active.cycleId,
				categories: value.categories,
				plannedServings: value.plannedServings,
				activatedAt: context.active.activatedAt,
				activatedBy: context.active.activatedBy,
				...(context.active.categoryOrder ? { categoryOrder: context.active.categoryOrder } : {}),
				...(context.active.shoppingStatus ? { shoppingStatus: context.active.shoppingStatus } : {}),
				tombstone: false
			})
		: reactivateDish(
				id,
				value.categories,
				value.plannedServings,
				identity.now,
				identity.clientId,
				identity.randomId()
			);
	const nextArchive: RecipeArchiveView = {
		...archive,
		recipeVersionId: `pending:${identity.randomId()}`,
		recipeVersion: (context.archive?.recipeVersion ?? 0) + 1
	};
	const requests: MenuMutation['requests'][number][] = [
		{
			path: context.archive ? `/api/menu/recipes/${context.archive.id}` : '/api/menu/recipes',
			method: context.archive ? 'PUT' : 'POST',
			body: { recipe: archive }
		}
	];
	let dishes = [...data.dishes];
	if (!context.archive && context.activateOnSave) {
		const entryId = identity.randomId();
		requests.push({ path: '/api/menu/entries', method: 'POST', body: { active, entryId } });
		dishes.push({
			archive: nextArchive,
			active,
			entryId,
			latestRecipeVersion: nextArchive.recipeVersion
		});
	} else if (context.active && context.entryId) {
		requests.push(
			{
				path: `/api/menu/entries/${context.entryId}`,
				method: 'PATCH',
				body: { active }
			},
			{
				path: `/api/menu/entries/${context.entryId}`,
				method: 'PATCH',
				body: { useLatest: true }
			}
		);
		dishes = dishes.map((dish) =>
			dish.entryId === context.entryId
				? {
						...dish,
						archive: nextArchive,
						active,
						latestRecipeVersion: nextArchive.recipeVersion
					}
				: dish
		);
	}
	return {
		next: {
			archives: context.archive
				? data.archives.map((candidate) =>
						candidate.id === nextArchive.id ? nextArchive : candidate
					)
				: [...data.archives, nextArchive],
			dishes
		},
		requests
	};
}

export function activateMenuArchive(
	data: MenuPageData,
	archive: RecipeArchiveView,
	categories: MealCategory[],
	plannedServings: number,
	identity: MenuCommandIdentity
): MenuMutation {
	const active = reactivateDish(
		archive.id,
		categories,
		plannedServings,
		identity.now,
		identity.clientId,
		identity.randomId()
	);
	const entryId = identity.randomId();
	return {
		next: {
			...data,
			dishes: [
				...data.dishes,
				{ archive, active, entryId, latestRecipeVersion: archive.recipeVersion }
			]
		},
		requests: [{ path: '/api/menu/entries', method: 'POST', body: { active, entryId } }]
	};
}

export function consumeMenuDish(
	data: MenuPageData,
	dish: TripMenuDish,
	category: MealCategory
): MenuMutation {
	const active = consumeDishCategory(dish.active, category);
	return updateMenuEntry(data, dish, active, active.tombstone);
}

export function moveMenuDish(
	data: MenuPageData,
	dish: TripMenuDish,
	from: MealCategory,
	to: MealCategory
): MenuMutation {
	return updateMenuEntry(data, dish, moveDishCategory(dish.active, from, to));
}

function updateMenuEntry(
	data: MenuPageData,
	dish: TripMenuDish,
	active: MenuActive,
	remove = false
): MenuMutation {
	return {
		next: {
			...data,
			dishes: remove
				? data.dishes.filter((candidate) => candidate.entryId !== dish.entryId)
				: data.dishes.map((candidate) =>
						candidate.entryId === dish.entryId ? { ...candidate, active } : candidate
					)
		},
		requests: [
			{
				path: `/api/menu/entries/${dish.entryId}`,
				method: 'PATCH',
				body: { active: serializeMenuActive(active) }
			}
		]
	};
}

export function reorderMenuDish(
	data: MenuPageData,
	dish: TripMenuDish,
	category: MealCategory,
	offset: -1 | 1
): MenuMutation | undefined {
	const categoryDishes = orderedDishesInCategory(data.dishes, category);
	const currentIndex = categoryDishes.findIndex(
		(candidate) => candidate.archive.id === dish.archive.id
	);
	const targetIndex = currentIndex + offset;
	if (currentIndex < 0 || targetIndex < 0 || targetIndex >= categoryDishes.length) return;
	const reordered = [...categoryDishes];
	[reordered[currentIndex], reordered[targetIndex]] = [
		reordered[targetIndex]!,
		reordered[currentIndex]!
	];
	const activeByEntry = new Map(
		reordered.map((candidate, position) => [
			candidate.entryId,
			{
				...candidate.active,
				categoryOrder: { ...candidate.active.categoryOrder, [category]: position }
			}
		])
	);
	return {
		next: {
			...data,
			dishes: data.dishes.map((candidate) => ({
				...candidate,
				active: activeByEntry.get(candidate.entryId) ?? candidate.active
			}))
		},
		requests: reordered.map((candidate) => ({
			path: `/api/menu/entries/${candidate.entryId}`,
			method: 'PATCH',
			body: { active: serializeMenuActive(activeByEntry.get(candidate.entryId)!) }
		}))
	};
}

export function archiveMenuRecipe(data: MenuPageData, archiveId: string): MenuMutation {
	return {
		next: {
			...data,
			archives: data.archives.filter((archive) => archive.id !== archiveId)
		},
		requests: [{ path: `/api/menu/recipes/${archiveId}`, method: 'DELETE' }]
	};
}

export function useLatestMenuRecipe(
	data: MenuPageData,
	dish: TripMenuDish,
	latest: RecipeArchiveView | undefined
): MenuMutation {
	return {
		next: {
			...data,
			dishes: data.dishes.map((candidate) =>
				candidate.entryId === dish.entryId && latest
					? { ...candidate, archive: latest, latestRecipeVersion: latest.recipeVersion }
					: candidate
			)
		},
		requests: [
			{
				path: `/api/menu/entries/${dish.entryId}`,
				method: 'PATCH',
				body: { useLatest: true }
			}
		]
	};
}

export function menuEditorForExistingArchive(
	archives: RecipeArchiveView[],
	dishes: TripMenuDish[],
	archive: MenuArchive
): MenuEditingContext | { activate: RecipeArchiveView } | undefined {
	const keyed = archives.find((entry) => entry.id === archive.id);
	if (!keyed) return;
	const dish = dishes.find((candidate) => candidate.archive.id === keyed.id);
	return dish
		? {
				archive: keyed,
				active: dish.active,
				entryId: dish.entryId,
				activateOnSave: true,
				initial: menuEditorFor(keyed, dish.active)
			}
		: { activate: keyed };
}
