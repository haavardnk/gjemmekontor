import { describe, expect, it } from 'vitest';

import type { PlanningPageData } from '../domain/planning';
import {
	addPlanningComment,
	deletePlanningCategory,
	deletePlanningComment,
	placePlanningCard,
	reactToPlanningCard,
	savePlanningCard,
	togglePlanningChecklistItem,
	updatePlanningComment
} from './planning-commands';

const personId = '00000000-0000-4000-8000-000000000011';
const foodId = '00000000-0000-4000-8000-000000000021';
const cardIds = [
	'00000000-0000-4000-8000-000000000031',
	'00000000-0000-4000-8000-000000000032'
] as const;
const newCardId = '00000000-0000-4000-8000-000000000039';
const itemIds = [
	'00000000-0000-4000-8000-000000000041',
	'00000000-0000-4000-8000-000000000042'
] as const;
const linkIds = [
	'00000000-0000-4000-8000-000000000051',
	'00000000-0000-4000-8000-000000000052'
] as const;
const timestamp = '2026-01-01T00:00:00.000Z';
const readyLink = {
	id: linkIds[0],
	url: 'https://example.com/',
	status: 'ready' as const,
	title: 'Eksempel',
	description: null,
	siteName: null,
	hasImage: true
};
const photoIds = [
	'00000000-0000-4000-8000-000000000061',
	'00000000-0000-4000-8000-000000000062'
] as const;

const data: PlanningPageData = {
	people: [{ id: personId, name: 'Kari' }],
	categories: [{ id: foodId, name: 'Mat', color: 'amber' }],
	cards: cardIds.map((id, index) => ({
		id,
		categoryId: index === 0 ? foodId : null,
		title: `Kort ${index + 1}`,
		body: '',
		place: null,
		checklist: [{ id: itemIds[index], text: 'Punkt', checked: false, checkedByPersonId: null }],
		links: index === 1 ? [readyLink] : [],
		photos: index === 0 ? [{ id: photoIds[0], width: 4, height: 3 }] : [],
		reactions: [],
		comments: [],
		createdByPersonId: personId,
		createdByName: 'Kari',
		createdAt: timestamp,
		updatedAt: timestamp
	}))
};

const sectionIds = (value: PlanningPageData, categoryId: string | null): string[] =>
	value.cards.filter((card) => card.categoryId === categoryId).map(({ id }) => id);

describe('planning commands', () => {
	it('creates new cards with a POST and edits existing cards with a PUT', () => {
		const draft = {
			personId,
			categoryId: foodId,
			title: ' Middag ',
			body: '',
			place: null,
			checklist: [],
			links: [
				{ id: linkIds[0], url: readyLink.url },
				{ id: linkIds[1], url: 'https://example.org/' }
			]
		};
		const created = savePlanningCard(data, newCardId, draft);
		const edited = savePlanningCard(data, cardIds[1], draft);

		expect(created.requests).toEqual([
			{
				path: '/api/planning/cards',
				method: 'POST',
				body: { ...draft, title: 'Middag', id: newCardId }
			}
		]);
		expect(edited.requests).toEqual([
			{
				path: `/api/planning/cards/${cardIds[1]}`,
				method: 'PUT',
				body: { ...draft, title: 'Middag' }
			}
		]);
		expect(sectionIds(edited.next, foodId)).toEqual([cardIds[0], cardIds[1]]);
		expect(edited.next.cards.find(({ id }) => id === cardIds[1])?.links).toEqual([
			readyLink,
			{
				id: linkIds[1],
				url: 'https://example.org/',
				status: 'pending',
				title: null,
				description: null,
				siteName: null,
				hasImage: false
			}
		]);
	});

	it('deletes removed photos before uploading new ones', () => {
		const mutation = savePlanningCard(
			data,
			cardIds[0],
			{
				personId,
				categoryId: foodId,
				title: 'Kort 1',
				body: '',
				place: null,
				checklist: [],
				links: []
			},
			{
				added: [
					{ id: photoIds[1], width: 4, height: 3, full: new Blob(['f']), thumb: new Blob(['t']) }
				],
				removed: [photoIds[0]]
			}
		);

		expect(mutation.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
			`PUT /api/planning/cards/${cardIds[0]}`,
			`DELETE /api/planning/photos/${photoIds[0]}`,
			`PUT /api/planning/cards/${cardIds[0]}/photos/${photoIds[1]}`
		]);
		expect(mutation.requests[2]?.form?.get('personId')).toBe(personId);
		expect(mutation.next.cards[0]?.photos).toEqual([]);
	});

	it('moves cards and sends cards of deleted categories to unsorted', () => {
		expect(sectionIds(placePlanningCard(data, cardIds[1], foodId, 0).next, foodId)).toEqual([
			cardIds[1],
			cardIds[0]
		]);
		expect(sectionIds(deletePlanningCategory(data, foodId).next, null)).toEqual([
			cardIds[1],
			cardIds[0]
		]);
	});

	it('requires a member to tick checklist items', () => {
		expect(() =>
			togglePlanningChecklistItem(data, cardIds[0], itemIds[0], cardIds[0], true)
		).toThrow('PLANNING_MEMBER_REQUIRED');
	});

	it('replaces a reaction and removes it when picked again', () => {
		const loved = reactToPlanningCard(data, cardIds[0], personId, 'love');
		const liked = reactToPlanningCard(loved.next, cardIds[0], personId, 'like');
		const cleared = reactToPlanningCard(liked.next, cardIds[0], personId, 'like');

		expect(liked.next.cards[0]?.reactions).toEqual([{ personId, reaction: 'like' }]);
		expect(liked.requests).toEqual([
			{
				path: `/api/planning/cards/${cardIds[0]}/reactions`,
				method: 'PUT',
				body: { personId, reaction: 'like' }
			}
		]);
		expect(cleared.next.cards[0]?.reactions).toEqual([]);
		expect(cleared.requests).toEqual([
			{ path: `/api/planning/cards/${cardIds[0]}/reactions`, method: 'DELETE', body: { personId } }
		]);
	});

	it('adds, edits, and deletes comments', () => {
		const commentId = '00000000-0000-4000-8000-000000000071';
		const added = addPlanningComment(data, cardIds[0], personId, ' Ja! ', () => commentId);
		const edited = updatePlanningComment(added.next, cardIds[0], commentId, 'Kanskje');
		const deleted = deletePlanningComment(edited.next, cardIds[0], commentId);

		expect(added.next.cards[0]?.comments).toMatchObject([
			{ id: commentId, personId, personName: 'Kari', body: 'Ja!' }
		]);
		expect(added.requests[0]?.body).toEqual({ id: commentId, personId, body: 'Ja!' });
		expect(edited.next.cards[0]?.comments[0]?.body).toBe('Kanskje');
		expect(deleted.next.cards[0]?.comments).toEqual([]);
		expect(deleted.requests[0]?.method).toBe('DELETE');
	});
});
