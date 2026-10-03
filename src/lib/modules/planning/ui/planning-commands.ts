import type { CachedResourceMutation } from '$lib/client/cached-resource';

import {
	planningCardCreateInputSchema,
	type PlanningCardDraft,
	planningCardInputSchema,
	planningCategoryCreateInputSchema,
	type PlanningCategoryInput,
	planningCategoryInputSchema,
	planningChecklistToggleInputSchema
} from '../domain/inputs';
import {
	moveInList,
	type PlanningCard,
	type PlanningPageData,
	planningSections
} from '../domain/planning';

export type PlanningMutation = CachedResourceMutation<PlanningPageData>;

function sectionCards(data: PlanningPageData, categoryId: string | null): PlanningCard[] {
	return (
		planningSections(data).find((section) => (section.category?.id ?? null) === categoryId)
			?.cards ?? []
	);
}

function withSection(
	data: PlanningPageData,
	categoryId: string | null,
	cards: readonly PlanningCard[]
): PlanningCard[] {
	const ids = new Set(cards.map((card) => card.id));
	return [
		...data.cards.filter((card) => !ids.has(card.id)),
		...cards.map((card) => ({ ...card, categoryId }))
	];
}

export function savePlanningCategory(
	data: PlanningPageData,
	categoryId: string | null,
	draft: PlanningCategoryInput,
	randomId: () => string = () => crypto.randomUUID()
): PlanningMutation {
	if (!categoryId) {
		const input = planningCategoryCreateInputSchema.parse({ ...draft, id: randomId() });
		return {
			next: { ...data, categories: [...data.categories, input] },
			requests: [{ path: '/api/planning/categories', method: 'POST', body: input }]
		};
	}
	const input = planningCategoryInputSchema.parse(draft);
	return {
		next: {
			...data,
			categories: data.categories.map((category) =>
				category.id === categoryId ? { ...category, ...input } : category
			)
		},
		requests: [{ path: `/api/planning/categories/${categoryId}`, method: 'PATCH', body: input }]
	};
}

export function deletePlanningCategory(
	data: PlanningPageData,
	categoryId: string
): PlanningMutation {
	const remaining = { ...data, categories: data.categories.filter(({ id }) => id !== categoryId) };
	return {
		next: {
			...remaining,
			cards: withSection(remaining, null, [
				...sectionCards(data, null),
				...sectionCards(data, categoryId)
			])
		},
		requests: [{ path: `/api/planning/categories/${categoryId}`, method: 'DELETE' }]
	};
}

export function placePlanningCategory(
	data: PlanningPageData,
	categoryId: string,
	index: number
): PlanningMutation {
	const category = data.categories.find(({ id }) => id === categoryId);
	if (!category) throw new Error('PLANNING_CATEGORY_NOT_FOUND');
	return {
		next: { ...data, categories: moveInList(data.categories, category, index) },
		requests: [
			{
				path: `/api/planning/categories/${categoryId}/placement`,
				method: 'PUT',
				body: { index }
			}
		]
	};
}

export function savePlanningCard(
	data: PlanningPageData,
	cardId: string | null,
	draft: PlanningCardDraft,
	randomId: () => string = () => crypto.randomUUID()
): PlanningMutation {
	const person = data.people.find(({ id }) => id === draft.personId);
	if (!person) throw new Error('PLANNING_MEMBER_REQUIRED');
	const existing = data.cards.find(({ id }) => id === cardId);
	if (cardId && !existing) throw new Error('PLANNING_CARD_NOT_FOUND');
	const input = existing
		? { ...planningCardInputSchema.parse(draft), id: existing.id }
		: planningCardCreateInputSchema.parse({ ...draft, id: randomId() });
	const now = new Date().toISOString();
	const { personId, ...fields } = input;
	const card: PlanningCard = {
		...fields,
		checklist: input.checklist.map((item) => ({
			...item,
			checkedByPersonId: item.checked
				? (existing?.checklist.find(({ id }) => id === item.id)?.checkedByPersonId ?? personId)
				: null
		})),
		createdByPersonId: existing?.createdByPersonId ?? person.id,
		createdByName: existing?.createdByName ?? person.name,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};
	const cards =
		existing?.categoryId === card.categoryId
			? data.cards.map((candidate) => (candidate.id === card.id ? card : candidate))
			: [...data.cards.filter(({ id }) => id !== card.id), card];
	const { id, ...body } = input;
	return {
		next: { ...data, cards },
		requests: [
			existing
				? { path: `/api/planning/cards/${id}`, method: 'PUT', body }
				: { path: '/api/planning/cards', method: 'POST', body: input }
		]
	};
}

export function deletePlanningCard(data: PlanningPageData, cardId: string): PlanningMutation {
	return {
		next: { ...data, cards: data.cards.filter(({ id }) => id !== cardId) },
		requests: [{ path: `/api/planning/cards/${cardId}`, method: 'DELETE' }]
	};
}

export function placePlanningCard(
	data: PlanningPageData,
	cardId: string,
	categoryId: string | null,
	index: number
): PlanningMutation {
	const card = data.cards.find(({ id }) => id === cardId);
	if (!card) throw new Error('PLANNING_CARD_NOT_FOUND');
	const target = sectionCards(data, categoryId);
	return {
		next: { ...data, cards: withSection(data, categoryId, moveInList(target, card, index)) },
		requests: [
			{
				path: `/api/planning/cards/${cardId}/placement`,
				method: 'PUT',
				body: { categoryId, index }
			}
		]
	};
}

export function togglePlanningChecklistItem(
	data: PlanningPageData,
	cardId: string,
	itemId: string,
	personId: string,
	checked: boolean
): PlanningMutation {
	if (!data.people.some(({ id }) => id === personId)) throw new Error('PLANNING_MEMBER_REQUIRED');
	const input = planningChecklistToggleInputSchema.parse({ personId, checked });
	return {
		next: {
			...data,
			cards: data.cards.map((card) =>
				card.id === cardId
					? {
							...card,
							checklist: card.checklist.map((item) =>
								item.id === itemId
									? { ...item, checked, checkedByPersonId: checked ? personId : null }
									: item
							)
						}
					: card
			)
		},
		requests: [
			{
				path: `/api/planning/cards/${cardId}/checklist/${itemId}`,
				method: 'PATCH',
				body: input
			}
		]
	};
}
