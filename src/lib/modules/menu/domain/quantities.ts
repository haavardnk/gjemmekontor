import type { MenuIngredient, Rational } from './menu';
import { resolveConvertibleUnit } from './units';

const vulgarFractions: Record<string, Rational> = {
	'¼': { numerator: 1, denominator: 4 },
	'½': { numerator: 1, denominator: 2 },
	'¾': { numerator: 3, denominator: 4 },
	'⅓': { numerator: 1, denominator: 3 },
	'⅔': { numerator: 2, denominator: 3 },
	'⅛': { numerator: 1, denominator: 8 },
	'⅜': { numerator: 3, denominator: 8 },
	'⅝': { numerator: 5, denominator: 8 },
	'⅞': { numerator: 7, denominator: 8 }
};

function gcd(left: number, right: number): number {
	let first = Math.abs(left);
	let second = Math.abs(right);
	while (second) [first, second] = [second, first % second];
	return first || 1;
}

export function reduceRational(value: Rational): Rational {
	const divisor = gcd(value.numerator, value.denominator);
	const sign = value.denominator < 0 ? -1 : 1;
	return {
		numerator: (value.numerator / divisor) * sign,
		denominator: Math.abs(value.denominator / divisor)
	};
}

export function addRational(left: Rational, right: Rational): Rational {
	return reduceRational({
		numerator: left.numerator * right.denominator + right.numerator * left.denominator,
		denominator: left.denominator * right.denominator
	});
}

export function multiplyRational(left: Rational, right: Rational): Rational {
	return reduceRational({
		numerator: left.numerator * right.numerator,
		denominator: left.denominator * right.denominator
	});
}

export function parseRational(text: string): Rational | undefined {
	const value = text.trim();
	if (!value) return undefined;
	if (vulgarFractions[value]) return vulgarFractions[value];
	const mixedVulgar = value.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/u);
	if (mixedVulgar) {
		const fraction = vulgarFractions[mixedVulgar[2] ?? ''];
		return fraction
			? addRational({ numerator: Number(mixedVulgar[1]), denominator: 1 }, fraction)
			: undefined;
	}
	const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed) {
		const denominator = Number(mixed[3]);
		return denominator
			? reduceRational({
					numerator: Number(mixed[1]) * denominator + Number(mixed[2]),
					denominator
				})
			: undefined;
	}
	const fraction = value.match(/^(\d+)\/(\d+)$/);
	if (fraction) {
		const denominator = Number(fraction[2]);
		return denominator
			? reduceRational({ numerator: Number(fraction[1]), denominator })
			: undefined;
	}
	const decimal = value.replace(',', '.').match(/^\d+(?:\.\d+)?$/)?.[0];
	if (!decimal) return undefined;
	const [whole = '0', decimals = ''] = decimal.split('.');
	const denominator = 10 ** decimals.length;
	return reduceRational({
		numerator: Number(whole) * denominator + Number(decimals || 0),
		denominator
	});
}

export type PlannedIngredient = {
	name: string;
	unit: string;
	quantity?: Rational;
	originalText: string;
	contributions: Array<{
		archiveId: string;
		dishName: string;
		ingredientId: string;
		originalText: string;
		quantity?: Rational;
		displayQuantity?: Rational;
		displayUnit?: string;
	}>;
};

function normalizedIngredientName(name: string): string {
	return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

function scaledQuantity(
	ingredient: MenuIngredient,
	plannedServings: number,
	baseServings: number
): {
	quantity?: Rational;
	unit: string;
	familyKey: string;
	displayQuantity?: Rational;
	displayUnit?: string;
} {
	const definition = resolveConvertibleUnit(ingredient.unit);
	const sourceQuantity = ingredient.normalizedQuantity ?? parseRational(ingredient.quantityText);
	const originalUnit = ingredient.unit.trim().toLocaleLowerCase('nb-NO');
	if (!sourceQuantity) {
		return {
			unit: originalUnit,
			familyKey: `raw-text:${originalUnit}:${ingredient.id}`
		};
	}
	const displayQuantity = multiplyRational(sourceQuantity, {
		numerator: plannedServings,
		denominator: baseServings
	});
	if (!definition) {
		return {
			quantity: displayQuantity,
			unit: originalUnit,
			familyKey: `raw-unit:${originalUnit}`,
			displayQuantity,
			displayUnit: ingredient.unit.trim()
		};
	}
	return {
		quantity: multiplyRational(displayQuantity, definition.factor),
		unit: definition.canonicalUnit,
		familyKey: definition.family,
		displayQuantity,
		displayUnit: ingredient.unit.trim()
	};
}

export function planIngredients(
	dishes: ReadonlyArray<{
		archiveId: string;
		dishName: string;
		baseServings: number;
		plannedServings: number;
		ingredients: readonly MenuIngredient[];
	}>
): PlannedIngredient[] {
	const planned = new Map<string, PlannedIngredient>();
	for (const dish of dishes) {
		for (const ingredient of dish.ingredients) {
			const scaled = scaledQuantity(ingredient, dish.plannedServings, dish.baseServings);
			const key = `${normalizedIngredientName(ingredient.name)}|${scaled.familyKey}`;
			const contribution = {
				archiveId: dish.archiveId,
				dishName: dish.dishName,
				ingredientId: ingredient.id,
				originalText: `${ingredient.quantityText} ${ingredient.unit}`.trim(),
				...(scaled.quantity ? { quantity: scaled.quantity } : {}),
				...(scaled.displayQuantity ? { displayQuantity: scaled.displayQuantity } : {}),
				...(scaled.displayUnit ? { displayUnit: scaled.displayUnit } : {})
			};
			const existing = planned.get(key);
			if (existing && existing.quantity && scaled.quantity) {
				existing.quantity = addRational(existing.quantity, scaled.quantity);
				existing.contributions.push(contribution);
			} else if (!existing) {
				planned.set(key, {
					name: ingredient.name,
					unit: scaled.unit,
					...(scaled.quantity ? { quantity: scaled.quantity } : {}),
					originalText: `${ingredient.quantityText} ${ingredient.unit}`.trim(),
					contributions: [contribution]
				});
			}
		}
	}
	return [...planned.values()].sort((left, right) =>
		left.name.localeCompare(right.name, 'nb-NO', { sensitivity: 'base' })
	);
}

export function displayQuantity(quantity: Rational, unit: string): string {
	const value = quantity.numerator / quantity.denominator;
	if (unit === 'g' && value >= 1_000) return `${formatNumber(value / 1_000)} kg`;
	if (unit === 'g' && value > 0 && value < 1) return `${formatNumber(value * 1_000)} mg`;
	if (unit === 'ml' && value >= 1_000) return `${formatNumber(value / 1_000)} l`;
	return `${formatNumber(value)} ${unit}`.trim();
}

export function displayRational(quantity: Rational): string {
	return formatNumber(quantity.numerator / quantity.denominator);
}

export function scaledIngredientQuantityText(
	ingredient: MenuIngredient,
	plannedServings: number,
	baseServings: number
): string {
	return ingredient.normalizedQuantity &&
		Number.isFinite(plannedServings) &&
		plannedServings > 0 &&
		Number.isFinite(baseServings) &&
		baseServings > 0
		? displayRational(
				multiplyRational(ingredient.normalizedQuantity, {
					numerator: plannedServings,
					denominator: baseServings
				})
			)
		: ingredient.quantityText;
}

export function baseQuantityFromDisplayedText(
	value: string,
	plannedServings: number,
	baseServings: number
): Rational | undefined {
	if (
		!Number.isFinite(plannedServings) ||
		plannedServings <= 0 ||
		!Number.isFinite(baseServings) ||
		baseServings <= 0
	) {
		return undefined;
	}
	const displayed = parseRational(value);
	return displayed
		? multiplyRational(displayed, {
				numerator: baseServings,
				denominator: plannedServings
			})
		: undefined;
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 3 }).format(value);
}
