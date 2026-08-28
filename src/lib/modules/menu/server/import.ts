import { parseIngredient } from 'parse-ingredient';
import { GenericScraper } from 'recipe-scrapers';
import { z } from 'zod';

import type {
	MenuEditorValue,
	MenuIngredient,
	MenuInstruction
} from '$lib/modules/menu/domain/menu';
import { parseRational } from '$lib/modules/menu/domain/quantities';
import { norwegianUnitDefinitions } from '$lib/modules/menu/domain/units';
import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import {
	extractEmbeddedGroupedRecipe,
	extractPageTitle,
	recoverDomIngredientGroups
} from './embedded-recipe';
import { fetchRemoteResource, RemoteFetchError } from './remote-fetch';

const importRequestSchema = z.object({ url: z.url().max(2_048) }).strict();

function quantityPrefix(value: string): string {
	return (
		value
			.trim()
			.match(
				/^(?:(?:ca\.?|cirka|omtrent)\s+)?((?:\d+\s+)?\d+\/\d+|\d+(?:[,.]\d+)?|\d*[¼½¾⅓⅔⅛⅜⅝⅞])/iu
			)?.[1] ?? ''
	);
}

function parseIngredientLine(value: string, group: string): MenuIngredient {
	const parsed = parseIngredient(value, {
		decimalSeparator: ',',
		includeMeta: true,
		additionalUOMs: norwegianUnitDefinitions,
		groupHeaderPatterns: ['For', 'Til'],
		rangeSeparators: ['to', 'or', 'til', 'eller'],
		descriptionStripPrefixes: ['of', 'av'],
		leadingQuantityPrefixes: ['ca.', 'ca', 'cirka', 'omtrent']
	})[0];
	const quantityText = quantityPrefix(value);
	const normalizedQuantity = parsed?.quantity2 == null ? parseRational(quantityText) : undefined;
	return {
		id: crypto.randomUUID(),
		group,
		quantityText,
		...(normalizedQuantity ? { normalizedQuantity } : {}),
		unit: parsed?.unitOfMeasure ?? '',
		name: parsed?.description?.trim() || value.trim(),
		note: ''
	};
}

async function optionalField<T>(operation: () => Promise<T>): Promise<T | undefined> {
	try {
		return await operation();
	} catch {
		return undefined;
	}
}

export async function importRecipeDraft(url: string): Promise<Partial<MenuEditorValue>> {
	const resource = await fetchRemoteResource(url, {
		accept: 'text/html,application/xhtml+xml',
		allowedContentTypes: ['text/html', 'application/xhtml+xml'],
		maximumBytes: 1_500_000
	});
	const html = new TextDecoder().decode(resource.body);
	return parseRecipeHtml(html, resource.finalUrl);
}

export async function parseRecipeHtml(
	html: string,
	finalUrl: string
): Promise<Partial<MenuEditorValue>> {
	const scraper = new GenericScraper(html, finalUrl);
	const [name, imageUrl, sourceYield, ingredientGroups, instructionGroups] = await Promise.all([
		optionalField(() => scraper.extract('title')),
		optionalField(() => scraper.extract('image')),
		optionalField(() => scraper.extract('yields')),
		optionalField(() => scraper.extract('ingredients')),
		optionalField(() => scraper.extract('instructions'))
	]);
	const servingsMatch = sourceYield?.match(/\d+/)?.[0];
	const servings = servingsMatch ? Number(servingsMatch) : 4;
	const embedded = extractEmbeddedGroupedRecipe(html);
	const parsedIngredients = embedded?.ingredients.length
		? embedded.ingredients.map((item) => parseIngredientLine(item.line, item.group))
		: (ingredientGroups ?? []).flatMap((group) =>
				group.items.map((item) => parseIngredientLine(item.value, group.name ?? ''))
			);
	const ingredients = recoverDomIngredientGroups(html, parsedIngredients);
	const instructions: MenuInstruction[] = embedded?.instructions.length
		? embedded.instructions.map((item) => ({
				id: crypto.randomUUID(),
				section: item.section,
				text: item.text
			}))
		: (instructionGroups ?? []).flatMap((group) =>
				group.items
					.filter((item) => !/^(?:step|steg)\s+\d+$/iu.test(item.value.trim()))
					.map((item) => ({
						id: crypto.randomUUID(),
						section: group.name ?? '',
						text: item.value
					}))
			);
	const resolvedName = name ?? extractPageTitle(html);
	return {
		...(resolvedName ? { name: resolvedName } : {}),
		sourceUrl: finalUrl,
		...(imageUrl ? { imageUrl: new URL(imageUrl, finalUrl).href } : {}),
		...(sourceYield ? { sourceYield } : {}),
		baseServings: Number.isSafeInteger(servings) && servings > 0 ? servings : 4,
		defaultPlannedServings: Number.isSafeInteger(servings) && servings > 0 ? servings : 4,
		plannedServings: Number.isSafeInteger(servings) && servings > 0 ? servings : 4,
		ingredients,
		instructions
	};
}

export async function handleImportRecipe(request: Request): Promise<Response> {
	const result = await parseJsonRequest(request, importRequestSchema);
	if (!result.success) return apiError('INVALID_REQUEST', 400);
	try {
		return apiSuccess(await importRecipeDraft(result.data.url));
	} catch (error) {
		if (error instanceof RemoteFetchError) return apiError(error.code, 400);
		return apiError('RECIPE_IMPORT_FAILED', 422);
	}
}
