import type { MenuIngredient, Rational } from './menu';
import { multiplyRational, scaledIngredientQuantityText } from './quantities';
import { resolveConvertibleUnit } from './units';

export type IngredientMeasurementMode = 'original' | 'mass' | 'volume';

export type IngredientMeasurement = {
	text: string;
	approximate: boolean;
	converted: boolean;
};

type IngredientDensity = {
	id: string;
	exactNames: string[];
	wordAliases: string[];
	gramsPerMilliliter: Rational;
	sourceUrl: string;
};

export const ingredientDensities: readonly IngredientDensity[] = [
	{
		id: 'water',
		exactNames: ['vann'],
		wordAliases: ['vann'],
		gramsPerMilliliter: { numerator: 1, denominator: 1 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'milk',
		exactNames: ['melk'],
		wordAliases: ['melk', 'helmelk', 'lettmelk', 'skummet melk', 'tinemelk'],
		gramsPerMilliliter: { numerator: 1, denominator: 1 },
		sourceUrl: 'https://www.melk.no/Melkefakta/Melk/Lettmelk'
	},
	{
		id: 'cream',
		exactNames: ['fløte', 'kremfløte', 'matfløte'],
		wordAliases: ['fløte', 'kremfløte', 'matfløte'],
		gramsPerMilliliter: { numerator: 1, denominator: 1 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'cultured-dairy',
		exactNames: ['rømme', 'crème fraîche', 'creme fraiche', 'kesam', 'yoghurt'],
		wordAliases: ['rømme', 'crème fraîche', 'creme fraiche', 'kesam', 'yoghurt'],
		gramsPerMilliliter: { numerator: 1, denominator: 1 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'wheat-flour',
		exactNames: ['mel', 'hvetemel'],
		wordAliases: ['hvetemel'],
		gramsPerMilliliter: { numerator: 55, denominator: 100 },
		sourceUrl: 'https://www.matprat.no/artikler/mengde-mal-og-vekt/mal-og-vekt/'
	},
	{
		id: 'white-sugar',
		exactNames: ['sukker', 'hvitt sukker', 'finkornet sukker'],
		wordAliases: [],
		gramsPerMilliliter: { numerator: 90, denominator: 100 },
		sourceUrl: 'https://www.matprat.no/artikler/mengde-mal-og-vekt/mal-og-vekt/'
	},
	{
		id: 'brown-sugar',
		exactNames: ['brunt sukker', 'brun farin', 'farinsukker'],
		wordAliases: ['brunt sukker', 'brun farin', 'farinsukker'],
		gramsPerMilliliter: { numerator: 70, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'dry-rice',
		exactNames: ['ris', 'basmatiris', 'jasminris', 'sushiris', 'tørr ris'],
		wordAliases: ['basmatiris', 'jasminris', 'sushiris'],
		gramsPerMilliliter: { numerator: 60, denominator: 100 },
		sourceUrl: 'https://www.matprat.no/artikler/matsvinn/porsjonsberegning-i-hverdagen/'
	},
	{
		id: 'rolled-oats',
		exactNames: ['havregryn', 'lettkokte havregryn'],
		wordAliases: ['havregryn'],
		gramsPerMilliliter: { numerator: 40, denominator: 100 },
		sourceUrl: 'https://www.matprat.no/artikler/mengde-mal-og-vekt/mal-og-vekt/'
	},
	{
		id: 'powdered-sugar',
		exactNames: ['melis'],
		wordAliases: ['melis'],
		gramsPerMilliliter: { numerator: 55, denominator: 100 },
		sourceUrl: 'https://www.matprat.no/artikler/mengde-mal-og-vekt/mal-og-vekt/'
	},
	{
		id: 'butter',
		exactNames: ['smør', 'meierismør', 'margarin'],
		wordAliases: ['smør', 'meierismør', 'margarin'],
		gramsPerMilliliter: { numerator: 85, denominator: 100 },
		sourceUrl: 'https://www.matprat.no/artikler/mengde-mal-og-vekt/mal-og-vekt/'
	},
	{
		id: 'cooking-oil',
		exactNames: ['olje', 'matolje', 'rapsolje', 'olivenolje', 'solsikkeolje'],
		wordAliases: ['matolje', 'rapsolje', 'olivenolje', 'solsikkeolje'],
		gramsPerMilliliter: { numerator: 90, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'honey',
		exactNames: ['honning'],
		wordAliases: ['honning'],
		gramsPerMilliliter: { numerator: 140, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'syrup',
		exactNames: ['sirup', 'lys sirup', 'mørk sirup'],
		wordAliases: ['sirup'],
		gramsPerMilliliter: { numerator: 140, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'cocoa-powder',
		exactNames: ['kakao', 'kakaopulver'],
		wordAliases: ['kakaopulver'],
		gramsPerMilliliter: { numerator: 50, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'coconut-milk',
		exactNames: ['kokosmelk'],
		wordAliases: ['kokosmelk'],
		gramsPerMilliliter: { numerator: 95, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'vinegar',
		exactNames: ['eddik', 'hvitvinseddik', 'rødvinseddik', 'eplecidereddik'],
		wordAliases: ['eddik', 'hvitvinseddik', 'rødvinseddik', 'eplecidereddik'],
		gramsPerMilliliter: { numerator: 1, denominator: 1 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'fine-salt',
		exactNames: ['salt', 'fint salt', 'bordsalt'],
		wordAliases: ['fint salt', 'bordsalt'],
		gramsPerMilliliter: { numerator: 130, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	},
	{
		id: 'coarse-salt',
		exactNames: ['grovt salt', 'grovsalt'],
		wordAliases: ['grovt salt', 'grovsalt'],
		gramsPerMilliliter: { numerator: 110, denominator: 100 },
		sourceUrl:
			'https://www.helsedirektoratet.no/brosjyrer/mal-vekt-og-porsjonsstorrelser-for-matvarer'
	}
];

function normalizedIngredientName(value: string): string {
	return value
		.normalize('NFKC')
		.toLocaleLowerCase('nb-NO')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function matchingDensity(name: string): IngredientDensity | undefined {
	const normalized = normalizedIngredientName(name);
	const words = new Set(normalized.split(' '));
	return ingredientDensities.find(
		(density) =>
			density.exactNames.includes(normalized) ||
			density.wordAliases.some((alias) =>
				alias.includes(' ') ? normalized.includes(alias) : words.has(alias)
			)
	);
}

function divideRational(left: Rational, right: Rational): Rational {
	return {
		numerator: left.numerator * right.denominator,
		denominator: left.denominator * right.numerator
	};
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(value);
}

function displayMass(quantity: Rational): string {
	const grams = quantity.numerator / quantity.denominator;
	if (grams >= 1_000) return `${formatNumber(grams / 1_000)} kg`;
	if (grams > 0 && grams < 1) return `${formatNumber(grams * 1_000)} mg`;
	return `${formatNumber(grams)} g`;
}

function displayVolume(quantity: Rational): string {
	const milliliters = quantity.numerator / quantity.denominator;
	if (milliliters >= 1_000) return `${formatNumber(milliliters / 1_000)} l`;
	if (milliliters >= 50) return `${formatNumber(milliliters / 100)} dl`;
	return `${formatNumber(milliliters)} ml`;
}

function originalMeasurement(
	ingredient: MenuIngredient,
	plannedServings: number,
	baseServings: number
): IngredientMeasurement {
	const quantity = scaledIngredientQuantityText(ingredient, plannedServings, baseServings);
	return {
		text: [quantity, ingredient.unit].filter(Boolean).join(' '),
		approximate: false,
		converted: false
	};
}

export function ingredientMeasurement(
	ingredient: MenuIngredient,
	plannedServings: number,
	baseServings: number,
	mode: IngredientMeasurementMode
): IngredientMeasurement {
	const original = originalMeasurement(ingredient, plannedServings, baseServings);
	if (mode === 'original' || !ingredient.normalizedQuantity) return original;
	const unit = resolveConvertibleUnit(ingredient.unit);
	if (!unit || unit.family === 'count') return original;
	const scaled = multiplyRational(ingredient.normalizedQuantity, {
		numerator: plannedServings,
		denominator: baseServings
	});
	const canonical = multiplyRational(scaled, unit.factor);
	if (mode === unit.family) {
		return {
			text: mode === 'mass' ? displayMass(canonical) : displayVolume(canonical),
			approximate: false,
			converted: true
		};
	}
	const density = matchingDensity(ingredient.name);
	if (!density) return original;
	const converted =
		mode === 'mass'
			? multiplyRational(canonical, density.gramsPerMilliliter)
			: divideRational(canonical, density.gramsPerMilliliter);
	return {
		text: mode === 'mass' ? displayMass(converted) : displayVolume(converted),
		approximate: true,
		converted: true
	};
}

export function densityNameForIngredient(name: string): string | undefined {
	return matchingDensity(name)?.id;
}
