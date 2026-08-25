import * as cheerio from 'cheerio';

export type EmbeddedGroupedRecipe = {
	ingredients: Array<{ group: string; line: string }>;
	instructions: Array<{ section: string; text: string }>;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: undefined;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function groupName(value: unknown): string {
	return text(value).replace(/:\s*$/u, '');
}

function htmlText(value: unknown): string {
	const source = text(value);
	return source ? cheerio.load(source).text().replace(/\s+/g, ' ').trim() : '';
}

function amountText(value: unknown): string {
	return typeof value === 'number' && Number.isFinite(value)
		? String(value)
		: typeof value === 'string'
			? value.trim()
			: '';
}

function groupedRecipe(value: UnknownRecord): EmbeddedGroupedRecipe | undefined {
	if (!Array.isArray(value.ingredientGroups) || !Array.isArray(value.stepGroups)) return undefined;
	const ingredients = value.ingredientGroups.flatMap((candidate) => {
		const group = record(candidate);
		if (!group) return [];
		const name = groupName(group.name ?? group.groupName);
		const lines = Array.isArray(group.ingredientLines)
			? group.ingredientLines
			: Array.isArray(group.ingredients)
				? group.ingredients
				: [];
		if (!lines.length) return [];
		return lines.flatMap((lineCandidate) => {
			const line = record(lineCandidate);
			if (!line) return [];
			const unit = record(line.unit);
			const ingredient = record(line.ingredient);
			const parts = [
				text(line.preText),
				amountText(line.amount),
				typeof line.unit === 'string'
					? text(line.unit)
					: text(unit?.singular) || text(unit?.plural) || text(unit?.abbrev),
				text(line.middleText),
				typeof line.name === 'string'
					? text(line.name)
					: text(ingredient?.singular) || text(ingredient?.plural) || text(ingredient?.name),
				text(line.postText),
				text(line.postText2)
			].filter(Boolean);
			return parts.length ? [{ group: name, line: parts.join(' ') }] : [];
		});
	});
	const instructions = value.stepGroups.flatMap((candidate) => {
		const group = record(candidate);
		if (!group || !Array.isArray(group.steps)) return [];
		const section = groupName(group.name ?? group.groupName);
		return group.steps.flatMap((stepCandidate) => {
			const step = record(stepCandidate);
			const content = Array.isArray(step?.content) ? step.content : [];
			const instruction =
				text(step?.instruction) ||
				text(step?.text) ||
				content
					.map((entry) => htmlText(record(entry)?.html))
					.filter(Boolean)
					.join(' ');
			return instruction ? [{ section, text: instruction }] : [];
		});
	});
	return ingredients.length || instructions.length ? { ingredients, instructions } : undefined;
}

function findGroupedRecipe(root: unknown): EmbeddedGroupedRecipe | undefined {
	const pending: unknown[] = [root];
	let visited = 0;
	while (pending.length && visited < 20_000) {
		visited += 1;
		const value = pending.pop();
		if (Array.isArray(value)) {
			pending.push(...value);
			continue;
		}
		const object = record(value);
		if (!object) continue;
		const recipe = groupedRecipe(object);
		if (recipe) return recipe;
		pending.push(...Object.values(object));
	}
	return undefined;
}

function parseNextPayload(script: string): unknown | undefined {
	const prefix = 'self.__next_f.push(';
	const value = script.trim();
	if (!value.startsWith(prefix) || !value.endsWith(')')) return undefined;
	try {
		const message = JSON.parse(value.slice(prefix.length, -1)) as unknown;
		if (!Array.isArray(message)) return undefined;
		const payload = message.find(
			(item) => typeof item === 'string' && item.includes('ingredientGroups')
		);
		if (typeof payload !== 'string') return undefined;
		const separator = payload.indexOf(':');
		if (separator < 0) return undefined;
		return JSON.parse(payload.slice(separator + 1));
	} catch {
		return undefined;
	}
}

export function extractEmbeddedGroupedRecipe(html: string): EmbeddedGroupedRecipe | undefined {
	const $ = cheerio.load(html);
	for (const element of $('script').toArray()) {
		const source = $(element).text();
		let parsed = parseNextPayload(source);
		if (
			parsed === undefined &&
			($(element).attr('id') === '__NEXT_DATA__' || $(element).attr('type') === 'application/json')
		) {
			try {
				parsed = JSON.parse(source);
			} catch {
				parsed = undefined;
			}
		}
		const recipe = parsed === undefined ? undefined : findGroupedRecipe(parsed);
		if (recipe) return recipe;
	}
	return undefined;
}

function normalized(value: string): string {
	return value
		.toLocaleLowerCase('nb-NO')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function recoverDomIngredientGroups<T extends { name: string; group: string }>(
	html: string,
	ingredients: readonly T[]
): T[] {
	if (ingredients.some((ingredient) => ingredient.group)) return [...ingredients];
	const $ = cheerio.load(html);
	const assigned = new Map<T, string>();
	for (const element of $('h2,h3,h4,h5').toArray()) {
		const heading = $(element);
		const headingName = groupName(heading.text());
		if (
			/^(?:slik gjør du|fremgangsmåte|framgangsmåte|tilberedning|method|directions|instructions)$/iu.test(
				headingName
			)
		) {
			break;
		}
		if (/^(?:ingredienser|ingredients)$/iu.test(headingName)) continue;
		const region = heading.nextUntil('h2,h3,h4,h5').text();
		const haystack = normalized(region);
		if (!haystack) continue;
		for (const ingredient of ingredients) {
			if (assigned.has(ingredient)) continue;
			const needle = normalized(ingredient.name);
			if (needle.length >= 3 && haystack.includes(needle)) assigned.set(ingredient, headingName);
		}
	}
	return ingredients.map((ingredient) => ({
		...ingredient,
		group: assigned.get(ingredient) ?? ingredient.group
	}));
}

export function extractPageTitle(html: string): string | undefined {
	const $ = cheerio.load(html);
	const value =
		$('meta[property="og:title"]').attr('content')?.trim() ||
		$('h1').first().text().trim() ||
		$('title').text().trim();
	return value || undefined;
}
