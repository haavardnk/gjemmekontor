import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import {
	handleDeleteNextTripSuggestion,
	handleNextTripRating,
	handleSaveNextTripSuggestion,
	loadNextTripPageData
} from './library';

const tripId = '00000000-0000-4000-8000-000000000001';
const otherTripId = '00000000-0000-4000-8000-000000000002';
const personId = '00000000-0000-4000-8000-000000000011';
const otherPersonId = '00000000-0000-4000-8000-000000000012';
const suggestionId = '00000000-0000-4000-8000-000000000021';
const otherSuggestionId = '00000000-0000-4000-8000-000000000022';
const timestamp = '2026-01-01T00:00:00.000Z';

function request(body: unknown): Request {
	return new Request('http://localhost/api/next-trip', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('next trip server library', () => {
	it('allows active members to rate and replaces their rating', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId, otherPersonId]);
		const suggestionResponse = await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Svalbard',
				note: '',
				url: '',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);
		expect(suggestionResponse.status).toBe(200);

		const firstRating = await handleNextTripRating(
			request({ personId: otherPersonId, score: 4 }),
			db,
			tripId,
			suggestionId
		);
		expect(firstRating.status).toBe(200);
		await handleNextTripRating(
			request({ personId: otherPersonId, score: 2 }),
			db,
			tripId,
			suggestionId
		);
		await handleNextTripRating(
			request({ personId: otherPersonId, score: 5 }),
			db,
			tripId,
			suggestionId
		);

		const data = loadNextTripPageData(db, tripId);
		expect(data.suggestions[0]?.ratings).toHaveLength(1);
		expect(data.suggestions[0]?.ratings[0]?.score).toBe(5);
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('deletes suggestions and their ratings idempotently', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId]);
		await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Svalbard',
				note: '',
				url: '',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);
		await handleNextTripRating(request({ personId, score: 5 }), db, tripId, suggestionId);

		const deleted = handleDeleteNextTripSuggestion(db, tripId, suggestionId);
		const repeated = handleDeleteNextTripSuggestion(db, tripId, suggestionId);

		expect(deleted.status).toBe(200);
		expect(await deleted.json()).toEqual({ deleted: true });
		expect(repeated.status).toBe(200);
		expect(await repeated.json()).toEqual({ deleted: false });
		expect(loadNextTripPageData(db, tripId).suggestions).toEqual([]);
		expect(db.prepare('SELECT COUNT(*) AS count FROM next_trip_ratings').get()).toEqual({
			count: 0
		});
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('keeps suggestions isolated by trip', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId]);
		seedTrip(db, otherTripId, 'trip-b', [otherPersonId]);
		await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Lofoten',
				note: '',
				url: '',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);

		expect(loadNextTripPageData(db, otherTripId).suggestions).toEqual([]);
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('accepts suggestions queued by the previous client shape', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId]);

		const response = await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Karibien',
				note: 'Fordi',
				url: '',
				submittedByPersonId: personId,
				submittedByName: 'Tina',
				createdAt: timestamp,
				updatedAt: timestamp,
				ratings: []
			}),
			db,
			tripId
		);

		expect(response.status).toBe(200);
		expect(loadNextTripPageData(db, tripId).suggestions[0]?.destination).toBe('Karibien');
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('rejects invalid suggestions and accepts duplicate ids without overwriting', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId]);
		const invalid = await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Svalbard',
				note: '',
				url: 'https://',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);
		expect(invalid.status).toBe(400);

		const first = await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Svalbard',
				note: '',
				url: '',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);
		const duplicate = await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Oslo',
				note: '',
				url: '',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);

		expect(first.status).toBe(200);
		expect(duplicate.status).toBe(200);
		expect(loadNextTripPageData(db, tripId).suggestions[0]?.destination).toBe('Svalbard');
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('accepts queued writes after a member becomes inactive', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId, otherPersonId]);
		await handleSaveNextTripSuggestion(
			request({
				id: suggestionId,
				destination: 'Svalbard',
				note: '',
				url: '',
				submittedByPersonId: personId
			}),
			db,
			tripId
		);
		db.prepare('UPDATE trip_members SET active = 0 WHERE trip_id = ? AND person_id = ?').run(
			tripId,
			otherPersonId
		);
		const suggestionResponse = await handleSaveNextTripSuggestion(
			request({
				id: otherSuggestionId,
				destination: 'Lofoten',
				note: '',
				url: '',
				submittedByPersonId: otherPersonId
			}),
			db,
			tripId
		);

		const response = await handleNextTripRating(
			request({ personId: otherPersonId, score: 5 }),
			db,
			tripId,
			suggestionId
		);

		expect(suggestionResponse.status).toBe(200);
		expect(response.status).toBe(200);
		const data = loadNextTripPageData(db, tripId);
		expect(
			data.suggestions.find((suggestion) => suggestion.id === suggestionId)?.ratings
		).toContainEqual({
			personId: otherPersonId,
			score: 5
		});
		expect(data.suggestions.map((suggestion) => suggestion.id)).toContain(otherSuggestionId);
		expect(data.people.map((person) => person.id)).not.toContain(otherPersonId);
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('accepts a queued rating when its suggestion no longer exists', async () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-next-trip-'));
		const db = createApplicationDatabase(dataDir);
		seedTrip(db, tripId, 'trip-a', [personId]);

		const response = await handleNextTripRating(
			request({ personId, score: 5 }),
			db,
			tripId,
			suggestionId
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ignored: true });
		db.close();
		rmSync(dataDir, { recursive: true, force: true });
	});
});

function seedTrip(
	db: ReturnType<typeof createApplicationDatabase>,
	id: string,
	slug: string,
	personIds: readonly string[]
): void {
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, ?, ?, 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	).run(id, slug, slug, timestamp, timestamp);
	const insertPerson = db.prepare(
		'INSERT INTO people (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)'
	);
	const insertMember = db.prepare(
		`INSERT INTO trip_members
		 (trip_id, person_id, active, sort_order, joined_at, removed_at)
		 VALUES (?, ?, 1, ?, ?, NULL)`
	);
	for (const [sortOrder, personId] of personIds.entries()) {
		insertPerson.run(personId, personId, timestamp, timestamp);
		insertMember.run(id, personId, sortOrder, timestamp);
	}
}
