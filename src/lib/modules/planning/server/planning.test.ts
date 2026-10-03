import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import {
	handleAddPlanningComment,
	handleCreatePlanningCard,
	handleCreatePlanningCategory,
	handleDeletePlanningCard,
	handleDeletePlanningCategory,
	handleDeletePlanningComment,
	handleDeletePlanningPhoto,
	handleDeletePlanningReaction,
	handlePlacePlanningCard,
	handlePlacePlanningCategory,
	handlePlanningLinkImage,
	handlePlanningPhoto,
	handleRetryPlanningLinkPreview,
	handleSetPlanningReaction,
	handleTogglePlanningChecklistItem,
	handleUpdatePlanningCard,
	handleUpdatePlanningComment,
	handleUploadPlanningPhoto,
	loadPlanningPageData
} from '.';
import { type PlanningFiles, planningFiles } from './files';
import { refreshPlanningLinkPreviews } from './link-previews';

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
const linkIds = [
	'00000000-0000-4000-8000-000000000051',
	'00000000-0000-4000-8000-000000000052'
] as const;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const photoIds = [
	'00000000-0000-4000-8000-000000000061',
	'00000000-0000-4000-8000-000000000062'
] as const;
const timestamp = '2026-01-01T00:00:00.000Z';

function photoJpeg(width: number, height: number): Uint8Array<ArrayBuffer> {
	return new Uint8Array([
		...[0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08],
		...[height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03],
		...Array.from({ length: 9 }, () => 0),
		...[0xff, 0xd9]
	]);
}

function photoRequest(
	fields: {
		personId?: string;
		full?: Uint8Array<ArrayBuffer>;
		thumb?: Uint8Array<ArrayBuffer>;
	} = {}
): Request {
	const form = new FormData();
	form.set('personId', fields.personId ?? personId);
	form.set('full', new File([fields.full ?? photoJpeg(2048, 1536)], 'full.jpg'));
	form.set('thumb', new File([fields.thumb ?? photoJpeg(480, 360)], 'thumb.jpg'));
	return new Request('http://localhost/api/planning', { method: 'PUT', body: form });
}

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
		links: [],
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
	let files: PlanningFiles;

	beforeEach(async () => {
		dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-planning-'));
		db = createApplicationDatabase(dataDir);
		files = planningFiles(dataDir, tripId);
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
			cardIds[0],
			files
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

	it('rejects links owned by another card or with a changed address', async () => {
		const link = { id: linkIds[0], url: 'https://example.com/a' };
		await handleCreatePlanningCard(request(card({ id: cardIds[0], links: [link] })), db, tripId);

		const foreign = await handleCreatePlanningCard(
			request(card({ id: cardIds[1], links: [link] })),
			db,
			tripId
		);
		const changed = await handleUpdatePlanningCard(
			request(card({ links: [{ ...link, url: 'https://example.com/b' }] })),
			db,
			tripId,
			cardIds[0],
			files
		);

		expect([foreign.status, changed.status]).toEqual([400, 400]);
		expect(loadPlanningPageData(db, tripId).cards[0]?.links).toMatchObject([link]);
	});

	it('stores fetched previews and removes images with their link', async () => {
		const links = [
			{ id: linkIds[0], url: 'https://example.com/a' },
			{ id: linkIds[1], url: 'https://example.com/b' }
		];
		await handleCreatePlanningCard(request(card({ id: cardIds[0], links })), db, tripId);

		const changed = await refreshPlanningLinkPreviews(db, tripId, files, async (url) => {
			if (url.endsWith('/b')) throw new Error('REMOTE_FETCH_FAILED');
			return {
				title: 'Hytte ved sjøen',
				description: 'Fire sengeplasser',
				siteName: 'Example',
				image: { type: 'image/jpeg', body: jpeg }
			};
		});

		expect(changed).toBe(true);
		expect(loadPlanningPageData(db, tripId).cards[0]?.links).toEqual([
			{
				...links[0],
				status: 'ready',
				title: 'Hytte ved sjøen',
				description: 'Fire sengeplasser',
				siteName: 'Example',
				hasImage: true
			},
			{
				...links[1],
				status: 'failed',
				title: null,
				description: null,
				siteName: null,
				hasImage: false
			}
		]);
		const image = handlePlanningLinkImage(db, tripId, linkIds[0], files);
		expect(image.headers.get('content-type')).toBe('image/jpeg');
		expect(new Uint8Array(await image.arrayBuffer())).toEqual(jpeg);
		expect(
			handlePlanningLinkImage(db, otherTripId, linkIds[0], planningFiles(dataDir, otherTripId))
				.status
		).toBe(404);

		handleRetryPlanningLinkPreview(db, tripId, linkIds[1]);
		expect(loadPlanningPageData(db, tripId).cards[0]?.links[1]?.status).toBe('pending');

		await handleUpdatePlanningCard(
			request(card({ links: [links[1]] })),
			db,
			tripId,
			cardIds[0],
			files
		);
		expect(existsSync(join(files.links, linkIds[0]))).toBe(false);
	});

	it('discards previews for cards deleted while fetching', async () => {
		const links = [{ id: linkIds[0], url: 'https://example.com/a' }];
		await handleCreatePlanningCard(request(card({ id: cardIds[0], links })), db, tripId);

		const changed = await refreshPlanningLinkPreviews(db, tripId, files, async () => {
			handleDeletePlanningCard(db, tripId, cardIds[0], files);
			return {
				title: 'X',
				description: null,
				siteName: null,
				image: { type: 'image/jpeg', body: jpeg }
			};
		});

		expect(changed).toBe(false);
		expect(existsSync(join(files.links, linkIds[0]))).toBe(false);
	});

	it('stores photos once per id and removes their files with the photo or card', async () => {
		for (const id of cardIds.slice(0, 2)) {
			await handleCreatePlanningCard(request(card({ id })), db, tripId);
		}
		const upload = (cardId: string, photoId: string): Promise<Response> =>
			handleUploadPlanningPhoto(photoRequest(), db, tripId, cardId, photoId, files);

		expect((await upload(cardIds[0], photoIds[0])).status).toBe(200);
		expect((await upload(cardIds[0], photoIds[0])).status).toBe(200);
		expect((await upload(cardIds[1], photoIds[0])).status).toBe(400);
		expect(
			loadPlanningPageData(db, tripId).cards.find(({ id }) => id === cardIds[0])?.photos
		).toEqual([{ id: photoIds[0], width: 2048, height: 1536 }]);
		const thumb = handlePlanningPhoto(db, tripId, photoIds[0], 'thumb', files);
		expect(new Uint8Array(await thumb.arrayBuffer())).toEqual(photoJpeg(480, 360));
		expect(
			handlePlanningPhoto(db, otherTripId, photoIds[0], 'full', planningFiles(dataDir, otherTripId))
				.status
		).toBe(404);
		expect(handlePlanningPhoto(db, tripId, photoIds[0], 'original', files).status).toBe(404);

		handleDeletePlanningPhoto(db, tripId, photoIds[0], files);
		expect(readdirSync(files.photos)).toEqual([]);
		await upload(cardIds[1], photoIds[1]);
		handleDeletePlanningCard(db, tripId, cardIds[1], files);
		expect(readdirSync(files.photos)).toEqual([]);
	});

	it.each([
		['a PNG', { full: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }, 400],
		['an oversized photo', { full: photoJpeg(4096, 1000) }, 400],
		['an oversized thumbnail', { thumb: photoJpeg(800, 600) }, 400],
		['an inactive member', { personId: inactivePersonId }, 409]
	])('rejects photos with %s', async (_, fields, expected) => {
		await handleCreatePlanningCard(request(card({ id: cardIds[0] })), db, tripId);

		const response = await handleUploadPlanningPhoto(
			photoRequest(fields),
			db,
			tripId,
			cardIds[0],
			photoIds[0],
			files
		);

		expect(response.status).toBe(expected);
		expect(existsSync(files.photos)).toBe(false);
	});

	it('limits photos per card', async () => {
		await handleCreatePlanningCard(request(card({ id: cardIds[0] })), db, tripId);
		const statuses: number[] = [];
		for (let index = 0; index <= 12; index += 1) {
			const response = await handleUploadPlanningPhoto(
				photoRequest(),
				db,
				tripId,
				cardIds[0],
				crypto.randomUUID(),
				files
			);
			statuses.push(response.status);
		}

		expect(statuses).toEqual([...Array.from({ length: 12 }, () => 200), 409]);
		expect(loadPlanningPageData(db, tripId).cards[0]?.photos).toHaveLength(12);
	});

	it('keeps one reaction per member and removes feedback with the card', async () => {
		await handleCreatePlanningCard(request(card({ id: cardIds[0] })), db, tripId);
		await handleSetPlanningReaction(
			request({ personId, reaction: 'love' }),
			db,
			tripId,
			cardIds[0]
		);
		await handleSetPlanningReaction(
			request({ personId, reaction: 'like' }),
			db,
			tripId,
			cardIds[0]
		);
		await handleSetPlanningReaction(
			request({ personId: otherPersonId, reaction: 'unsure' }),
			db,
			tripId,
			cardIds[0]
		);
		const inactive = await handleSetPlanningReaction(
			request({ personId: inactivePersonId, reaction: 'dislike' }),
			db,
			tripId,
			cardIds[0]
		);
		await handleDeletePlanningReaction(
			request({ personId: otherPersonId }),
			db,
			tripId,
			cardIds[0]
		);

		expect(inactive.status).toBe(409);
		expect(loadPlanningPageData(db, tripId).cards[0]?.reactions).toEqual([
			{ personId, reaction: 'like' }
		]);

		const commentId = '00000000-0000-4000-8000-000000000071';
		const comment = { id: commentId, personId, body: 'Ja!' };
		await handleAddPlanningComment(request(comment), db, tripId, cardIds[0]);
		await handleAddPlanningComment(request(comment), db, tripId, cardIds[0]);
		await handleUpdatePlanningComment(
			request({ body: 'Kanskje' }),
			db,
			tripId,
			cardIds[0],
			commentId
		);
		expect(loadPlanningPageData(db, tripId).cards[0]?.comments).toMatchObject([
			{ id: commentId, personId, personName: personId, body: 'Kanskje' }
		]);

		handleDeletePlanningComment(db, tripId, cardIds[0], commentId);
		await handleAddPlanningComment(request(comment), db, tripId, cardIds[0]);
		expect(loadPlanningPageData(db, tripId).cards[0]?.comments).toEqual([]);

		handleDeletePlanningCard(db, tripId, cardIds[0], files);
		const remaining = db
			.prepare(
				`SELECT (SELECT count(*) FROM planning_card_reactions)
				      + (SELECT count(*) FROM planning_card_comments) AS count`
			)
			.get() as { count: number };
		expect(remaining.count).toBe(0);
	});
});
