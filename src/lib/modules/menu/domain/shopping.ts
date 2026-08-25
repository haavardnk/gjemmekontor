import { createHash } from 'node:crypto';

import type { ShoppingPlanningSnapshot } from '$lib/modules/shopping-list/public';
import { sanitizeShoppingListText } from '$lib/modules/shopping-list/public';

import type { CurrentDish, Rational } from './menu';
import {
	addRational,
	displayQuantity,
	multiplyRational,
	parseRational,
	planIngredients,
	type PlannedIngredient
} from './quantities';
import { resolveConvertibleUnit } from './units';

export type MenuShoppingScope = 'dish' | 'menu';

export type MenuShoppingPreviewRow = {
	id: string;
	sourceRowIds: string[];
	include: boolean;
	name: string;
	sourceName: string;
	alreadyInList: boolean;
	currentSpecification: string;
	proposedSpecification: string;
	preservedSpecification: string;
	replacementSpecification: string;
	warnings: string[];
	requiresCorrection: boolean;
	archiveIds: string[];
	dishNames: string[];
};

export type MenuShoppingPreview = {
	fingerprint: string;
	rows: MenuShoppingPreviewRow[];
	skippedDishes: string[];
};

function normalizedShoppingName(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

function shoppingRowId(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function parseSpecification(value: string): { quantity: Rational; unit: string } | undefined {
	const trimmed = value.trim();
	const match =
		trimmed.match(/^(?:totalt:\s*)?(\d+(?:[,.]\d+)?)\s*([\p{L}.]+)(?:\s*[·|]|$)/iu) ??
		trimmed.match(/(?:^|·\s*totalt\s+)(\d+(?:[,.]\d+)?)\s*([\p{L}.]+)$/iu);
	if (!match) return undefined;
	const quantity = parseRational(match[1] ?? '');
	const definition = resolveConvertibleUnit(match[2] ?? '');
	if (!quantity) return undefined;
	return definition
		? { quantity: multiplyRational(quantity, definition.factor), unit: definition.canonicalUnit }
		: { quantity, unit: (match[2] ?? '').toLocaleLowerCase('nb-NO') };
}

export function menuShoppingFingerprint(dishes: readonly CurrentDish[]): string {
	const data = dishes
		.map((dish) => ({
			archive: dish.archive,
			active: dish.active
		}))
		.sort((left, right) => left.archive.id.localeCompare(right.archive.id));
	return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function compactSpecification(
	current: string,
	contributions: string[],
	total: string
): { value: string; blocked: boolean } {
	const existing = parseExistingDescription(current);
	const details = [...existing.menuContributions, ...contributions];
	const parts = [
		`Totalt: ${total}`,
		...(details.length ? [details.join('; ')] : []),
		...(existing.previousDescription ? [`Fra før: ${existing.previousDescription}`] : [])
	];
	let value = sanitizeShoppingListText(parts.join(' | '));
	if (value.length <= 120) return { value, blocked: false };
	const dishNames = [...new Set(details.map(contributionDishName).filter(Boolean))].join(', ');
	value = sanitizeShoppingListText(
		[
			`Totalt: ${total}`,
			...(dishNames ? [`Til: ${dishNames}`] : []),
			...(existing.previousDescription ? [`Fra før: ${existing.previousDescription}`] : [])
		].join(' | ')
	);
	return { value, blocked: value.length > 120 };
}

type ExistingDescription = {
	menuContributions: string[];
	dishNames: string[];
	previousDescription: string;
};

function contributionDishName(contribution: string): string {
	return contribution.split(':')[0]?.trim() ?? '';
}

function parseExistingDescription(current: string): ExistingDescription {
	const trimmed = sanitizeShoppingListText(current).trim();
	if (!trimmed) {
		return { menuContributions: [], dishNames: [], previousDescription: '' };
	}
	const sections = trimmed.split(/\s*(?:\||·)\s*/u).filter(Boolean);
	const generated =
		/^(?:totalt|til):/iu.test(sections[0] ?? '') ||
		(sections.length > 1 &&
			Boolean(parseSpecification(trimmed)) &&
			sections.slice(1).some((section) => section.includes(':')));
	if (!generated) {
		return { menuContributions: [], dishNames: [], previousDescription: trimmed };
	}
	const menuContributions: string[] = [];
	const dishNames: string[] = [];
	const previousDescriptions: string[] = [];
	for (const [index, section] of sections.entries()) {
		if (index === 0 && parseSpecification(section)) continue;
		if (/^fra før:/iu.test(section)) {
			const previous = section.replace(/^fra før:\s*/iu, '').trim();
			if (previous) previousDescriptions.push(previous);
			continue;
		}
		if (/^til:/iu.test(section)) {
			dishNames.push(
				...section
					.replace(/^til:\s*/iu, '')
					.split(',')
					.map((value) => value.trim())
					.filter(Boolean)
			);
			continue;
		}
		const contributionSection = section.replace(/^nytt:\s*/iu, '').trim();
		if (contributionSection) {
			menuContributions.push(
				...contributionSection
					.split(';')
					.map((value) => value.trim())
					.filter(Boolean)
			);
		}
	}
	return {
		menuContributions,
		dishNames,
		previousDescription: previousDescriptions.join(' | ')
	};
}

function dishOnlySpecification(
	current: string,
	dishNames: readonly string[]
): { value: string; blocked: boolean } {
	const existing = parseExistingDescription(current);
	const allDishNames = [
		...existing.dishNames,
		...existing.menuContributions.map(contributionDishName),
		...dishNames
	].filter(Boolean);
	const uniqueDishNames = [...new Set(allDishNames)];
	const value = sanitizeShoppingListText(
		[
			`Til: ${uniqueDishNames.map(sanitizeShoppingListText).join(', ')}`,
			...(existing.previousDescription ? [`Fra før: ${existing.previousDescription}`] : [])
		].join(' | ')
	);
	return { value, blocked: value.length > 120 };
}

function combineCompatibleIngredients(
	ingredients: readonly PlannedIngredient[]
): PlannedIngredient[] {
	const combined: PlannedIngredient[] = [];
	for (const ingredient of ingredients) {
		const existing = ingredient.quantity
			? combined.find((candidate) => candidate.quantity && candidate.unit === ingredient.unit)
			: undefined;
		if (existing?.quantity && ingredient.quantity) {
			existing.quantity = addRational(existing.quantity, ingredient.quantity);
			existing.contributions.push(...ingredient.contributions);
		} else {
			combined.push({
				...ingredient,
				...(ingredient.quantity ? { quantity: { ...ingredient.quantity } } : {}),
				contributions: [...ingredient.contributions]
			});
		}
	}
	return combined;
}

function contributionQuantityText(
	contribution: PlannedIngredient['contributions'][number],
	ingredient: PlannedIngredient
): string {
	if (contribution.displayQuantity && contribution.displayUnit) {
		return displayQuantity(contribution.displayQuantity, contribution.displayUnit);
	}
	return contribution.quantity
		? displayQuantity(contribution.quantity, ingredient.unit)
		: contribution.originalText;
}

function plannedTotalText(ingredient: PlannedIngredient): string {
	const onlyContribution =
		ingredient.contributions.length === 1 ? ingredient.contributions[0] : undefined;
	return onlyContribution?.displayQuantity && onlyContribution.displayUnit
		? displayQuantity(onlyContribution.displayQuantity, onlyContribution.displayUnit)
		: ingredient.quantity
			? displayQuantity(ingredient.quantity, ingredient.unit)
			: ingredient.originalText;
}

export function createMenuShoppingPreview(
	dishes: readonly CurrentDish[],
	planning: ShoppingPlanningSnapshot,
	scope: MenuShoppingScope,
	includeAlreadyAdded: boolean,
	nameOverrides: Readonly<Record<string, string>> = {}
): MenuShoppingPreview {
	const includedDishes =
		scope === 'menu' && !includeAlreadyAdded
			? dishes.filter((dish) => !dish.active.shoppingStatus)
			: [...dishes];
	const skippedDishes = dishes
		.filter((dish) => !includedDishes.includes(dish))
		.map((dish) => dish.archive.name);
	const catalogByName = new Map(
		planning.catalog.map((item) => [normalizedShoppingName(item.name), item])
	);
	const planned = planIngredients(
		includedDishes.map((dish) => ({
			archiveId: dish.archive.id,
			dishName: dish.archive.name,
			baseServings: dish.archive.baseServings,
			plannedServings: dish.active.plannedServings,
			ingredients: dish.archive.ingredients
		}))
	);
	const originalGroups = new Map<string, PlannedIngredient[]>();
	for (const ingredient of planned) {
		const key = normalizedShoppingName(ingredient.name);
		originalGroups.set(key, [...(originalGroups.get(key) ?? []), ingredient]);
	}
	const grouped = new Map<
		string,
		{ ingredients: PlannedIngredient[]; requestedName: string; sourceRowIds: string[] }
	>();
	for (const [normalizedName, ingredients] of originalGroups) {
		const sourceRowId = shoppingRowId(normalizedName);
		const requestedName = nameOverrides[sourceRowId]?.trim() || ingredients[0]!.name;
		const requestedKey = normalizedShoppingName(requestedName);
		const existing = grouped.get(requestedKey);
		if (existing) {
			existing.ingredients.push(...ingredients);
			existing.sourceRowIds.push(sourceRowId);
		} else {
			grouped.set(requestedKey, {
				ingredients: [...ingredients],
				requestedName,
				sourceRowIds: [sourceRowId]
			});
		}
	}
	const dishOrder = new Map(includedDishes.map((dish, index) => [dish.archive.id, index]));
	const rows = [...grouped.entries()].map(
		([normalizedRequestedName, group]): MenuShoppingPreviewRow => {
			const ingredients = combineCompatibleIngredients(group.ingredients);
			for (const plannedIngredient of ingredients) {
				plannedIngredient.contributions.sort(
					(left, right) =>
						(dishOrder.get(left.archiveId) ?? Number.MAX_SAFE_INTEGER) -
							(dishOrder.get(right.archiveId) ?? Number.MAX_SAFE_INTEGER) ||
						left.ingredientId.localeCompare(right.ingredientId)
				);
			}
			ingredients.sort(
				(left, right) =>
					(dishOrder.get(left.contributions[0]?.archiveId ?? '') ?? Number.MAX_SAFE_INTEGER) -
					(dishOrder.get(right.contributions[0]?.archiveId ?? '') ?? Number.MAX_SAFE_INTEGER)
			);
			const { requestedName } = group;
			const sourceRowIds = [...group.sourceRowIds].sort();
			const ingredient = ingredients[0]!;
			const id =
				sourceRowIds.length === 1 ? sourceRowIds[0]! : shoppingRowId(sourceRowIds.join('|'));
			const catalog = catalogByName.get(normalizedRequestedName);
			const name = catalog?.name ?? sanitizeShoppingListText(requestedName).trim();
			const sourceName = catalog?.name ?? sanitizeShoppingListText(requestedName);
			const existing =
				planning.snapshot.items.find(
					(item) => item.sourceName === (catalog?.sourceName ?? sourceName)
				) ??
				planning.snapshot.items.find(
					(item) =>
						normalizedShoppingName(item.name) === normalizedRequestedName ||
						normalizedShoppingName(item.sourceName) === normalizedRequestedName
				);
			const currentSpecification = existing?.specification ?? '';
			const warnings: string[] = [];
			if (!catalog && !existing) warnings.push('Kontroller varenavnet før du legger til.');
			const allContributions = ingredients.flatMap((value) => value.contributions);
			const archiveIds = [...new Set(allContributions.map((value) => value.archiveId))];
			const dishNames = [...new Set(allContributions.map((value) => value.dishName))];
			const withoutMeasurement = ingredients.every(
				(plannedIngredient) => !plannedIngredient.quantity && !plannedIngredient.originalText.trim()
			);
			const buildSpecification = (
				baseSpecification: string
			): { value: string; blocked: boolean } => {
				if (withoutMeasurement) {
					return dishOnlySpecification(baseSpecification, dishNames);
				}
				if (ingredients.length === 1 && ingredient.quantity) {
					const current = parseSpecification(baseSpecification);
					const total =
						current?.unit === ingredient.unit
							? addRational(current.quantity, ingredient.quantity)
							: ingredient.quantity;
					const contributions = ingredient.contributions.map(
						(contribution) =>
							`${sanitizeShoppingListText(contribution.dishName)}: ${contributionQuantityText(
								contribution,
								ingredient
							)}`
					);
					return compactSpecification(
						baseSpecification,
						contributions,
						displayQuantity(total, ingredient.unit)
					);
				}
				if (ingredients.length === 1) {
					const contributions = ingredient.contributions.map(
						(contribution) =>
							`${sanitizeShoppingListText(contribution.dishName)}: ${contribution.originalText}`
					);
					return compactSpecification(baseSpecification, contributions, ingredient.originalText);
				}
				const contributions = ingredients.flatMap((plannedIngredient) =>
					plannedIngredient.contributions.map(
						(contribution) =>
							`${sanitizeShoppingListText(contribution.dishName)}: ${contributionQuantityText(
								contribution,
								plannedIngredient
							)}`
					)
				);
				return compactSpecification(
					baseSpecification,
					contributions,
					ingredients.map(plannedTotalText).join(' og ')
				);
			};
			const preserved = buildSpecification(currentSpecification);
			const replacement = buildSpecification('');
			const proposedSpecification = preserved.value;
			const requiresCorrection = !sourceName || preserved.blocked;
			if (preserved.blocked) warnings.push('Beskrivelsen er lengre enn Bring tillater.');
			if (
				currentSpecification &&
				ingredients.length === 1 &&
				ingredient.quantity &&
				!parseSpecification(currentSpecification)
			) {
				warnings.push('Eksisterende detaljer er beholdt som «Fra før».');
			}
			if (ingredients.length > 1) {
				warnings.push('Kan ikke regne om mellom vekt, volum eller stykk. Delsummene beholdes.');
			}
			return {
				id,
				sourceRowIds,
				include: !requiresCorrection,
				name,
				sourceName,
				alreadyInList: Boolean(existing),
				currentSpecification,
				proposedSpecification,
				preservedSpecification: preserved.value,
				replacementSpecification: replacement.value,
				warnings,
				requiresCorrection,
				archiveIds,
				dishNames
			};
		}
	);
	return { fingerprint: menuShoppingFingerprint(dishes), rows, skippedDishes };
}
