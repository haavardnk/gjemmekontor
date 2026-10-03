import { z } from 'zod';

export const planningCategoryColors = [
	'sky',
	'emerald',
	'amber',
	'rose',
	'violet',
	'slate'
] as const;
export type PlanningCategoryColor = (typeof planningCategoryColors)[number];

export const planningLimits = {
	categories: 30,
	cards: 500,
	categoryName: 40,
	title: 120,
	body: 5000,
	placeLabel: 300,
	checklistItems: 50,
	checklistText: 200,
	links: 10,
	url: 2048
} as const;

export const planningLinkStatuses = ['pending', 'ready', 'failed'] as const;

const personSchema = z.object({ id: z.uuid(), name: z.string() }).strict();

const categorySchema = z
	.object({
		id: z.uuid(),
		name: z.string().min(1),
		color: z.enum(planningCategoryColors)
	})
	.strict();

const placeSchema = z
	.object({
		label: z.string().min(1),
		lat: z.number().nullable(),
		lng: z.number().nullable(),
		googlePlaceId: z.string().nullable()
	})
	.strict();

const checklistItemSchema = z
	.object({
		id: z.uuid(),
		text: z.string().min(1),
		checked: z.boolean(),
		checkedByPersonId: z.uuid().nullable()
	})
	.strict();

const linkSchema = z
	.object({
		id: z.uuid(),
		url: z.string().min(1),
		status: z.enum(planningLinkStatuses),
		title: z.string().nullable(),
		description: z.string().nullable(),
		siteName: z.string().nullable(),
		hasImage: z.boolean()
	})
	.strict();

const cardSchema = z
	.object({
		id: z.uuid(),
		categoryId: z.uuid().nullable(),
		title: z.string().min(1),
		body: z.string(),
		place: placeSchema.nullable(),
		checklist: z.array(checklistItemSchema),
		links: z.array(linkSchema),
		createdByPersonId: z.uuid(),
		createdByName: z.string(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime()
	})
	.strict();

export const planningPageDataSchema = z
	.object({
		people: z.array(personSchema),
		categories: z.array(categorySchema),
		cards: z.array(cardSchema)
	})
	.strict();

export type PlanningPerson = z.infer<typeof personSchema>;
export type PlanningCategory = z.infer<typeof categorySchema>;
export type PlanningPlace = z.infer<typeof placeSchema>;
export type PlanningChecklistItem = z.infer<typeof checklistItemSchema>;
export type PlanningLink = z.infer<typeof linkSchema>;
export type PlanningCard = z.infer<typeof cardSchema>;
export type PlanningPageData = z.infer<typeof planningPageDataSchema>;

export type PlanningSection = {
	category: PlanningCategory | null;
	cards: PlanningCard[];
};

export function planningSections(
	data: Pick<PlanningPageData, 'categories' | 'cards'>
): PlanningSection[] {
	const unsorted = data.cards.filter(
		(card) =>
			!card.categoryId || !data.categories.some((category) => category.id === card.categoryId)
	);
	return [
		...data.categories.map((category) => ({
			category,
			cards: data.cards.filter((card) => card.categoryId === category.id)
		})),
		...(unsorted.length ? [{ category: null, cards: unsorted }] : [])
	];
}

export function moveInList<T>(items: readonly T[], item: T, index: number): T[] {
	const remaining = items.filter((candidate) => candidate !== item);
	remaining.splice(Math.max(0, Math.min(index, remaining.length)), 0, item);
	return remaining;
}

export function checklistProgress(card: PlanningCard): { checked: number; total: number } {
	return {
		checked: card.checklist.filter((item) => item.checked).length,
		total: card.checklist.length
	};
}

export function planningLinkImagePath(linkId: string): string {
	return `/api/planning/links/${linkId}/image`;
}

export function planningLinkHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

export function googleMapsPlaceUrl(place: PlanningPlace): string {
	const url = new URL('https://www.google.com/maps/search/');
	url.searchParams.set('api', '1');
	url.searchParams.set(
		'query',
		place.lat !== null && place.lng !== null ? `${place.lat},${place.lng}` : place.label
	);
	if (place.googlePlaceId) url.searchParams.set('query_place_id', place.googlePlaceId);
	return url.toString();
}
