import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import {
	handleCreatePlanningCard,
	handleCreatePlanningCategory,
	handleDeletePlanningCategory,
	handlePlacePlanningCard,
	handlePlacePlanningCategory,
	handleTogglePlanningChecklistItem,
	handleUpdatePlanningCard,
	loadPlanningPageData
} from '.';

const tripId = '00000000-0000-4000-8000-000000000001';
const otherTripId = '00000000-0000-4000-8000-000000000002';
const personId = '00000000-0000-4000-8000-000000000011';
const otherPersonId = '00000000-0000-4000-8000-000000000012';
const inactivePersonId = '00000000-0000-4000-8000-000000000013';
const foodId = '00000000-0000-4000-8000-000000000021';
const hikeId = '00000000-0000-4000-8000-000000000022';
const foreignCategoryId = '00000000-0000-4000-8000-000000000023';
const cardIds = [
	'00000000-0000-4000-8000-000000000031',
	'00000000-0000-4000-8000-000000000032',
	'00000000-0000-4000-8000-000000000033'
] as const;
const itemIds = [
	'00000000-0000-4000-8000-000000000041',
	'00000000-0000-4000-8000-000000000042'
] as const;
const timestamp = '2026-01-01T00:00:00.000Z';

type Db = ReturnType<typeof createApplicationDatabase>;

function request(body: unknown): Request {
	return new Request('http://localhost/api/planning', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		personId,
		categoryId: null,
		title: 'Idé',
		body: '',
		place: null,
		checklist: [],
		...overrides
	};
}

function seedTrip(db: Db, id: string, slug: string, personIds: readonly string[]): void {
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, ?, ?, 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	).run(id, slug, slug, timestamp, timestamp);
	const insertPerson = db.prepare(
		'INSERT OR IGNORE INTO people (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)'
	);
	const insertMember = db.prepare(
		`INSERT INTO trip_members (trip_id, person_id, active, sort_order, joined_at, removed_at)
		 VALUES (?, ?, ?, ?, ?, NULL)`
	);
	for (const [sortOrder, memberId] of personIds.entries()) {
		insertPerson.run(memberId, memberId, timestamp, timestamp);
		insertMember.run(id, memberId, memberId === inactivePersonId ? 0 : 1, sortOrder, timestamp);
	}
}

function sectionTitles(db: Db): Record<string, string[]> {
	const sections: Record<string, string[]> = {};
	for (const { categoryId, title } of loadPlanningPageData(db, tripId).cards) {
		const key = categoryId ?? 'unsorted';
		sections[key] = [...(sections[key] ?? []), title];
	}
	return sections;
}

describe('planning server', () => {
	let dataDir: string;
	let db: Db;

	beforeEach(async () => {
		dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-planning-'));
		db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId, otherPersonId, inactivePersonId]);
		seedTrip(db, otherTripId, 'trip-b', [personId]);
		for (const [id, name] of [
			[foodId, 'Mat'],
			[hikeId, 'Turer']
		] as const) {
			await handleCreatePlanningCategory(request({ id, name, color: 'sky' }), db, tripId);
		}
		await handleCreatePlanningCategory(
			request({ id: foreignCategoryId, name: 'Annen', color: 'rose' }),
			db,
			otherTripId
		);
	});

	afterEach(() => {
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('moves cards between sections and keeps both sections dense', async () => {
		for (const [index, id] of cardIds.entries()) {
			await handleCreatePlanningCard(
				request(card({ id, categoryId: foodId, title: `Kort ${index + 1}` })),
				db,
				tripId
			);
		}

		await handlePlacePlanningCard(
			request({ categoryId: hikeId, index: 0 }),
			db,
			tripId,
			cardIds[0]
		);
		await handlePlacePlanningCard(
			request({ categoryId: foodId, index: 0 }),
			db,
			tripId,
			cardIds[2]
		);
		expect(sectionTitles(db)).toEqual({ [foodId]: ['Kort 3', 'Kort 2'], [hikeId]: ['Kort 1'] });

		await handlePlacePlanningCategory(request({ index: 0 }), db, tripId, hikeId);
		expect(loadPlanningPageData(db, tripId).categories.map(({ name }) => name)).toEqual([
			'Turer',
			'Mat'
		]);

		await handleCreatePlanningCard(
			request(card({ id: cardIds[1], categoryId: null, title: 'Duplikat' })),
			db,
			tripId
		);
		handleDeletePlanningCategory(db, tripId, foodId);
		expect(sectionTitles(db)).toEqual({ unsorted: ['Kort 3', 'Kort 2'], [hikeId]: ['Kort 1'] });
	});

	it('keeps who checked an item when the card is edited', async () => {
		const checklist = [
			{ id: itemIds[0], text: 'Bestill bord', checked: false },
			{ id: itemIds[1], text: 'Sjekk åpningstider', checked: false }
		];
		await handleCreatePlanningCard(request(card({ id: cardIds[0], checklist })), db, tripId);
		await handleTogglePlanningChecklistItem(
			request({ personId: otherPersonId, checked: true }),
			db,
			tripId,
			cardIds[0],
			itemIds[0]
		);

		const response = await handleUpdatePlanningCard(
			request(
				card({
					title: 'Middag',
					place: { label: 'Mathallen', lat: 59.92, lng: 10.75, googlePlaceId: 'place-1' },
					checklist: [{ ...checklist[0], checked: true }]
				})
			),
			db,
			tripId,
			cardIds[0]
		);

		expect(response.status).toBe(200);
		expect(loadPlanningPageData(db, tripId).cards[0]).toMatchObject({
			title: 'Middag',
			place: { label: 'Mathallen', lat: 59.92, lng: 10.75, googlePlaceId: 'place-1' },
			checklist: [{ id: itemIds[0], checked: true, checkedByPersonId: otherPersonId }]
		});
	});

	it.each([
		['an inactive member', card({ personId: inactivePersonId }), 409],
		['another trip category', card({ categoryId: foreignCategoryId }), 409],
		[
			'half a coordinate',
			card({ place: { label: 'X', lat: 1, lng: null, googlePlaceId: null } }),
			400
		],
		[
			'duplicate checklist ids',
			card({
				checklist: [
					{ id: itemIds[0], text: 'A', checked: false },
					{ id: itemIds[0], text: 'B', checked: false }
				]
			}),
			400
		]
	])('rejects cards from %s', async (_name, body, status) => {
		const response = await handleCreatePlanningCard(
			request({ ...body, id: cardIds[0] }),
			db,
			tripId
		);
		expect(response.status).toBe(status);
		expect(loadPlanningPageData(db, tripId).cards).toEqual([]);
	});

	it('rejects checklist items owned by another card', async () => {
		const checklist = [{ id: itemIds[0], text: 'A', checked: false }];
		await handleCreatePlanningCard(request(card({ id: cardIds[0], checklist })), db, tripId);
		const response = await handleCreatePlanningCard(
			request(card({ id: cardIds[1], checklist })),
			db,
			tripId
		);
		expect(response.status).toBe(400);
		expect(loadPlanningPageData(db, tripId).cards).toHaveLength(1);
	});
});
