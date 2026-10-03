import type { CachedResourceMutation, CachedResourceRequest } from '$lib/client/cached-resource';

import type { PlanningPhotoUpload } from '../client/photos';
import {
	planningCardCreateInputSchema,
	type PlanningCardDraft,
	planningCategoryCreateInputSchema,
	type PlanningCategoryInput,
	planningCategoryInputSchema,
	planningChecklistToggleInputSchema,
	planningCommentEditInputSchema,
	planningCommentInputSchema,
	planningReactionDeleteInputSchema,
	planningReactionInputSchema
} from '../domain/inputs';
import {
	moveInList,
	type PlanningCard,
	type PlanningPageData,
	type PlanningReactionKind,
	planningSections
} from '../domain/planning';

export type PlanningMutation = CachedResourceMutation<PlanningPageData>;

function withCard(
	data: PlanningPageData,
	cardId: string,
	change: (card: PlanningCard) => PlanningCard
): PlanningPageData {
	if (!data.cards.some(({ id }) => id === cardId)) throw new Error('PLANNING_CARD_NOT_FOUND');
	return { ...data, cards: data.cards.map((card) => (card.id === cardId ? change(card) : card)) };
}

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

export type PlanningPhotoChanges = {
	added: readonly PlanningPhotoUpload[];
	removed: readonly string[];
};

export function savePlanningCard(
	data: PlanningPageData,
	cardId: string,
	draft: PlanningCardDraft,
	photos: PlanningPhotoChanges = { added: [], removed: [] }
): PlanningMutation {
	const person = data.people.find(({ id }) => id === draft.personId);
	if (!person) throw new Error('PLANNING_MEMBER_REQUIRED');
	const existing = data.cards.find(({ id }) => id === cardId);
	const input = planningCardCreateInputSchema.parse({ ...draft, id: cardId });
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
		links: input.links.map(
			(link) =>
				existing?.links.find(({ id }) => id === link.id) ?? {
					...link,
					status: 'pending' as const,
					title: null,
					description: null,
					siteName: null,
					hasImage: false
				}
		),
		photos: (existing?.photos ?? []).filter(({ id }) => !photos.removed.includes(id)),
		reactions: existing?.reactions ?? [],
		comments: existing?.comments ?? [],
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
				: { path: '/api/planning/cards', method: 'POST', body: input },
			...photos.removed.map((photoId): CachedResourceRequest => ({
				path: `/api/planning/photos/${photoId}`,
				method: 'DELETE'
			})),
			...photos.added.map((photo): CachedResourceRequest => {
				const form = new FormData();
				form.set('personId', personId);
				form.set('full', photo.full, 'photo.jpg');
				form.set('thumb', photo.thumb, 'thumb.jpg');
				return { path: `/api/planning/cards/${id}/photos/${photo.id}`, method: 'PUT', form };
			})
		]
	};
}

export function deletePlanningCard(data: PlanningPageData, cardId: string): PlanningMutation {
	return {
		next: { ...data, cards: data.cards.filter(({ id }) => id !== cardId) },
		requests: [{ path: `/api/planning/cards/${cardId}`, method: 'DELETE' }]
	};
}

export function retryPlanningLinkPreview(data: PlanningPageData, linkId: string): PlanningMutation {
	return {
		next: {
			...data,
			cards: data.cards.map((card) => ({
				...card,
				links: card.links.map((link) =>
					link.id === linkId ? { ...link, status: 'pending' as const } : link
				)
			}))
		},
		requests: [{ path: `/api/planning/links/${linkId}/preview`, method: 'POST' }]
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

export function reactToPlanningCard(
	data: PlanningPageData,
	cardId: string,
	personId: string,
	reaction: PlanningReactionKind
): PlanningMutation {
	if (!data.people.some(({ id }) => id === personId)) throw new Error('PLANNING_MEMBER_REQUIRED');
	const card = data.cards.find(({ id }) => id === cardId);
	const others = card?.reactions.filter((candidate) => candidate.personId !== personId) ?? [];
	const path = `/api/planning/cards/${cardId}/reactions`;
	if (card?.reactions.some((item) => item.personId === personId && item.reaction === reaction)) {
		return {
			next: withCard(data, cardId, (current) => ({ ...current, reactions: others })),
			requests: [
				{ path, method: 'DELETE', body: planningReactionDeleteInputSchema.parse({ personId }) }
			]
		};
	}
	const input = planningReactionInputSchema.parse({ personId, reaction });
	return {
		next: withCard(data, cardId, (current) => ({ ...current, reactions: [...others, input] })),
		requests: [{ path, method: 'PUT', body: input }]
	};
}

export function addPlanningComment(
	data: PlanningPageData,
	cardId: string,
	personId: string,
	body: string,
	randomId: () => string = () => crypto.randomUUID()
): PlanningMutation {
	const person = data.people.find(({ id }) => id === personId);
	if (!person) throw new Error('PLANNING_MEMBER_REQUIRED');
	const input = planningCommentInputSchema.parse({ id: randomId(), personId, body });
	const now = new Date().toISOString();
	return {
		next: withCard(data, cardId, (card) => ({
			...card,
			comments: [
				...card.comments,
				{ ...input, personName: person.name, createdAt: now, updatedAt: now }
			]
		})),
		requests: [{ path: `/api/planning/cards/${cardId}/comments`, method: 'POST', body: input }]
	};
}

export function updatePlanningComment(
	data: PlanningPageData,
	cardId: string,
	commentId: string,
	body: string
): PlanningMutation {
	const input = planningCommentEditInputSchema.parse({ body });
	const now = new Date().toISOString();
	return {
		next: withCard(data, cardId, (card) => ({
			...card,
			comments: card.comments.map((comment) =>
				comment.id === commentId ? { ...comment, body: input.body, updatedAt: now } : comment
			)
		})),
		requests: [
			{ path: `/api/planning/cards/${cardId}/comments/${commentId}`, method: 'PATCH', body: input }
		]
	};
}

export function deletePlanningComment(
	data: PlanningPageData,
	cardId: string,
	commentId: string
): PlanningMutation {
	return {
		next: withCard(data, cardId, (card) => ({
			...card,
			comments: card.comments.filter(({ id }) => id !== commentId)
		})),
		requests: [{ path: `/api/planning/cards/${cardId}/comments/${commentId}`, method: 'DELETE' }]
	};
}
