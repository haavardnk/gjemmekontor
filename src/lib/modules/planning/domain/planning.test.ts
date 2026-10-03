import { describe, expect, it } from 'vitest';

import {
	googleMapsPlaceUrl,
	moveInList,
	type PlanningCard,
	type PlanningCategory,
	planningSections
} from './planning';

const category = (id: string): PlanningCategory => ({ id, name: id, color: 'sky' });
const card = (id: string, categoryId: string | null): PlanningCard => ({
	id,
	categoryId,
	title: id,
	body: '',
	place: null,
	checklist: [],
	links: [],
	createdByPersonId: '00000000-0000-4000-8000-000000000011',
	createdByName: 'Kari',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
});

describe('planning domain', () => {
	it('groups cards by category and keeps unsorted cards last', () => {
		const sections = planningSections({
			categories: [category('food'), category('hikes')],
			cards: [card('a', null), card('b', 'hikes'), card('c', 'gone'), card('d', 'hikes')]
		});
		expect(
			sections.map((section) => [section.category?.id ?? null, section.cards.map(({ id }) => id)])
		).toEqual([
			['food', []],
			['hikes', ['b', 'd']],
			[null, ['a', 'c']]
		]);
	});

	it.each([
		[0, ['c', 'a', 'b']],
		[1, ['a', 'c', 'b']],
		[99, ['a', 'b', 'c']]
	])('moves an item to index %i', (index, expected) => {
		expect(moveInList(['a', 'b', 'c'], 'c', index)).toEqual(expected);
	});

	it.each([
		[
			{ label: 'Mathallen', lat: 59.92, lng: 10.75, googlePlaceId: 'abc' },
			'https://www.google.com/maps/search/?api=1&query=59.92%2C10.75&query_place_id=abc'
		],
		[
			{ label: 'Bergen sentrum', lat: null, lng: null, googlePlaceId: null },
			'https://www.google.com/maps/search/?api=1&query=Bergen+sentrum'
		]
	])('links %o to Google Maps', (place, expected) => {
		expect(googleMapsPlaceUrl(place)).toBe(expected);
	});
});
