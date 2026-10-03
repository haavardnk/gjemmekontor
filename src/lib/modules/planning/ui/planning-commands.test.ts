import { describe, expect, it } from 'vitest';

import type { PlanningPageData } from '../domain/planning';
import {
	deletePlanningCategory,
	placePlanningCard,
	savePlanningCard,
	togglePlanningChecklistItem
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
const timestamp = '2026-01-01T00:00:00.000Z';

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
			checklist: []
		};
		const created = savePlanningCard(data, null, draft, () => newCardId);
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
});
