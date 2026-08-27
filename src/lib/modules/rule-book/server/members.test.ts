import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';
import { ruleBookGameKey } from '$lib/modules/rule-book/domain/rule-book';

import { handleRuleBookPreference, handleStartRuleBookGame, listRuleBookMembers } from './members';

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;
const tripId = 'd95f7536-c13b-4cee-a035-bd6dc40efb59';
const people = [
	{ id: '67070037-a2e4-4fc0-9790-20adae9bd7e9', name: 'Ada' },
	{ id: '94da58a8-558a-42bb-b59f-d86cd0647dca', name: 'Bo' },
	{ id: 'c2f94afa-101d-4ed7-8f50-82e59449417d', name: 'Cleo' }
];

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-rule-book-'));
	db = createApplicationDatabase(dataDir);
	db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, 'test-trip', 'Test Trip', 'Europe/Oslo', 'active', 'listed',
		         'Velkommen', '2026-08-27', '2026-08-27')`
	).run(tripId);
	db.prepare('INSERT INTO trip_revisions (trip_id, revision) VALUES (?, 0)').run(tripId);
	const insertPerson = db.prepare(
		`INSERT INTO people (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)`
	);
	const insertMember = db.prepare(
		`INSERT INTO trip_members
		 (trip_id, person_id, active, sort_order, joined_at)
		 VALUES (?, ?, 1, ?, '2026-08-27')`
	);
	for (const [index, person] of people.entries()) {
		insertPerson.run(person.id, person.name, '2026-08-27', '2026-08-27');
		insertMember.run(tripId, person.id, index);
	}
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function jsonRequest(body: unknown): Request {
	return new Request('http://localhost/api/rule-book', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('rule book trip members', (): void => {
	test('includes every active trip member by default and stores only opt-outs', async (): Promise<void> => {
		expect(listRuleBookMembers(db, tripId)).toEqual(
			people.map((person) => ({ ...person, optedOut: false }))
		);

		const optedOut = await handleRuleBookPreference(
			jsonRequest({ personId: people[1]?.id, optedOut: true }),
			db,
			tripId
		);
		expect(optedOut.status).toBe(200);
		expect(listRuleBookMembers(db, tripId)[1]).toMatchObject({ name: 'Bo', optedOut: true });
		expect(
			(
				db.prepare('SELECT COUNT(*) AS count FROM trip_member_module_preferences').get() as {
					count: number;
				}
			).count
		).toBe(1);

		await handleRuleBookPreference(
			jsonRequest({ personId: people[1]?.id, optedOut: false }),
			db,
			tripId
		);
		expect(listRuleBookMembers(db, tripId)[1]).toMatchObject({ name: 'Bo', optedOut: false });
		expect(
			(
				db.prepare('SELECT COUNT(*) AS count FROM trip_member_module_preferences').get() as {
					count: number;
				}
			).count
		).toBe(0);
	});

	test('starts with an immutable snapshot of current opted-in members', async (): Promise<void> => {
		await handleRuleBookPreference(
			jsonRequest({ personId: people[1]?.id, optedOut: true }),
			db,
			tripId
		);
		const response = await handleStartRuleBookGame(
			jsonRequest({ clientId: 'client-a' }),
			db,
			tripId,
			() => new Date('2026-08-27T12:00:00.000Z'),
			() => 0.9
		);
		expect(response.status).toBe(200);
		const game = await response.json();
		expect(game.participantOrder).toEqual([
			{ id: people[0]?.id, name: 'Ada' },
			{ id: people[2]?.id, name: 'Cleo' }
		]);

		db.prepare('UPDATE trip_members SET active = 0 WHERE trip_id = ? AND person_id = ?').run(
			tripId,
			people[0]?.id
		);
		const stored = db
			.prepare('SELECT value FROM trip_state_entries WHERE trip_id = ? AND key = ?')
			.get(tripId, ruleBookGameKey) as { value: string };
		expect(JSON.parse(stored.value).participantOrder).toEqual(game.participantOrder);
	});

	test('refuses to start when fewer than two members participate', async (): Promise<void> => {
		for (const person of people.slice(1)) {
			await handleRuleBookPreference(
				jsonRequest({ personId: person.id, optedOut: true }),
				db,
				tripId
			);
		}
		const response = await handleStartRuleBookGame(
			jsonRequest({ clientId: 'client-a' }),
			db,
			tripId
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'RULE_BOOK_NEEDS_MEMBERS' });
	});
});
