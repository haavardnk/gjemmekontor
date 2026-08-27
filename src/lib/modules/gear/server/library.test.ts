import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import {
	handleArchiveGearItem,
	handleGearPacking,
	handleGearSelection,
	handleRetainGearItem,
	handleSaveGearItem,
	loadGearPageData
} from './library';

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

const tripA = '1eb979f0-bbcc-4dd8-ac41-68ff790e216f';
const tripB = '838b92f6-cac1-4f83-8d0b-8ee91e92903a';
const alice = '9cbe844e-24b0-41a7-a3d0-36413240afd7';
const bob = 'ec737707-5a55-4f20-a1d1-c93c676c39f0';
const departed = 'c5d35cb4-2ef8-423b-983a-621e56fd9c33';
const categoryId = 'c7f38af2-6fbc-40df-95fc-c24015626520';
const aliceItem = 'bd90b039-811e-45bd-bec3-8918d5b369e5';
const bobItem = '67bc6517-8945-44fa-9a47-5cc631fd8ff9';
const departedItem = '7b675ecb-d480-4b1d-994b-55a1c8a843a7';
const sharedItem = '30eab1be-4fa0-4542-b70c-37d973fa4daa';
const newItem = '68858369-682a-48a2-8143-e511e8f1dfc4';
const timestamp = '2026-08-27T10:00:00.000Z';

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-gear-library-'));
	db = createApplicationDatabase(dataDir);
	seedTripsAndPeople();
	seedGear();
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function request(body: unknown, method = 'POST'): Request {
	return new Request('http://localhost/api/gear', {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function seedTripsAndPeople(): void {
	const insertTrip = db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, ?, ?, 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	);
	insertTrip.run(tripA, 'trip-a', 'Trip A', timestamp, timestamp);
	insertTrip.run(tripB, 'trip-b', 'Trip B', timestamp, timestamp);

	const insertPerson = db.prepare(
		`INSERT INTO people (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)`
	);
	insertPerson.run(alice, 'Alice', timestamp, timestamp);
	insertPerson.run(bob, 'Bob', timestamp, timestamp);
	insertPerson.run(departed, 'Departed', timestamp, timestamp);

	const insertMember = db.prepare(
		`INSERT INTO trip_members
		 (trip_id, person_id, active, sort_order, joined_at, removed_at)
		 VALUES (?, ?, ?, ?, ?, ?)`
	);
	insertMember.run(tripA, alice, 1, 0, timestamp, null);
	insertMember.run(tripA, departed, 0, 1, timestamp, timestamp);
	insertMember.run(tripB, bob, 1, 0, timestamp, null);
}

function seedGear(): void {
	db.prepare(
		`INSERT INTO gear_categories
		 (id, name, sort_order, archived_at, created_at, updated_at)
		 VALUES (?, 'Kamera', 0, NULL, ?, ?)`
	).run(categoryId, timestamp, timestamp);

	const insertItem = db.prepare(
		`INSERT INTO gear_items
		 (id, name, category_id, default_quantity, default_notes, lifecycle_status,
		  archived_at, created_at, updated_at)
		 VALUES (?, ?, ?, 1, '', 'available', NULL, ?, ?)`
	);
	insertItem.run(aliceItem, 'Alice camera', categoryId, timestamp, timestamp);
	insertItem.run(bobItem, 'Bob camera', categoryId, timestamp, timestamp);
	insertItem.run(departedItem, 'Old tripod', categoryId, timestamp, timestamp);
	insertItem.run(sharedItem, 'Shared drone', categoryId, timestamp, timestamp);

	const insertOwner = db.prepare(
		`INSERT INTO gear_item_owners (gear_item_id, person_id, ownership_role)
		 VALUES (?, ?, 'owner')`
	);
	insertOwner.run(aliceItem, alice);
	insertOwner.run(bobItem, bob);
	insertOwner.run(departedItem, departed);
	insertOwner.run(sharedItem, alice);
	insertOwner.run(sharedItem, bob);

	db.prepare(
		`INSERT INTO trip_gear_items
		 (trip_id, gear_item_id, quantity_override, availability, trip_notes,
		  owner_resolution, active, added_at, updated_at)
		 VALUES (?, ?, NULL, 'available', '', 'current', 1, ?, ?)`
	).run(tripA, departedItem, timestamp, timestamp);
	db.prepare(
		`INSERT INTO trip_gear_packing
		 (trip_id, gear_item_id, packed, packed_at, packed_by_person_id)
		 VALUES (?, ?, 0, NULL, NULL)`
	).run(tripA, departedItem);
}

function itemInput(overrides: Record<string, unknown> = {}) {
	return {
		id: newItem,
		categoryId,
		name: 'New item',
		quantity: 1,
		ownerIds: [],
		availability: 'need-to-buy',
		notes: '',
		selected: true,
		...overrides
	};
}

describe('trip-connected gear library', (): void => {
	test('filters the global archive by current trip members on the server', async (): Promise<void> => {
		const dataA = loadGearPageData(db, tripA);
		const dataB = loadGearPageData(db, tripB);

		expect(dataA.items.map((item) => item.id).sort()).toEqual(
			[aliceItem, departedItem, sharedItem].sort()
		);
		expect(dataB.items.map((item) => item.id).sort()).toEqual([bobItem, sharedItem].sort());
		expect(dataA.items.find((item) => item.id === bobItem)).toBeUndefined();

		const selectForeign = await handleGearSelection(
			request({ selected: true }, 'PATCH'),
			db,
			tripA,
			bobItem
		);
		expect(selectForeign.status).toBe(404);
		const editForeign = await handleSaveGearItem(
			request(itemInput({ id: bobItem, ownerIds: [alice] }), 'PUT'),
			db,
			tripA,
			bobItem
		);
		expect(editForeign.status).toBe(404);
		expect(handleArchiveGearItem(db, tripA, bobItem).status).toBe(404);
	});

	test('requires an explicit decision when an owner leaves the trip', async (): Promise<void> => {
		const before = loadGearPageData(db, tripA).items.find((item) => item.id === departedItem);
		expect(before).toMatchObject({
			selected: true,
			packed: false,
			ownerIds: [departed],
			needsOwnerResolution: true,
			retainedWithoutCurrentOwner: false
		});

		const blocked = await handleGearPacking(
			request({ packed: true }, 'PATCH'),
			db,
			tripA,
			departedItem
		);
		expect(blocked.status).toBe(409);
		expect(handleRetainGearItem(db, tripA, departedItem).status).toBe(200);
		const packed = await handleGearPacking(
			request({ packed: true }, 'PATCH'),
			db,
			tripA,
			departedItem
		);
		expect(packed.status).toBe(200);
		expect(
			loadGearPageData(db, tripA).items.find((item) => item.id === departedItem)
		).toMatchObject({
			packed: true,
			needsOwnerResolution: true,
			retainedWithoutCurrentOwner: true
		});
	});

	test('keeps selection and packing trip-specific while gear stays connected', async (): Promise<void> => {
		expect(
			(await handleGearSelection(request({ selected: true }, 'PATCH'), db, tripA, sharedItem))
				.status
		).toBe(200);
		expect(
			(await handleGearSelection(request({ selected: true }, 'PATCH'), db, tripB, sharedItem))
				.status
		).toBe(200);
		expect(
			(await handleGearPacking(request({ packed: true }, 'PATCH'), db, tripA, sharedItem)).status
		).toBe(200);
		expect(
			(
				await handleSaveGearItem(
					request(
						itemInput({
							id: sharedItem,
							name: 'Updated shared drone',
							ownerIds: [alice],
							availability: 'available'
						}),
						'PUT'
					),
					db,
					tripA,
					sharedItem
				)
			).status
		).toBe(200);

		expect(loadGearPageData(db, tripA).items.find((item) => item.id === sharedItem)?.packed).toBe(
			true
		);
		expect(loadGearPageData(db, tripB).items.find((item) => item.id === sharedItem)).toMatchObject({
			name: 'Updated shared drone',
			ownerIds: [alice, bob],
			packed: false
		});
		expect(handleArchiveGearItem(db, tripA, sharedItem).status).toBe(409);
	});

	test('allows trip-only purchases and connects them once an owner is assigned', async (): Promise<void> => {
		const created = await handleSaveGearItem(request(itemInput()), db, tripA);
		expect(created.status).toBe(200);
		expect(loadGearPageData(db, tripA).items.find((item) => item.id === newItem)).toMatchObject({
			availability: 'need-to-buy',
			ownerIds: [],
			selected: true
		});
		expect(loadGearPageData(db, tripB).items.find((item) => item.id === newItem)).toBeUndefined();

		const missingOwner = await handleSaveGearItem(
			request(itemInput({ availability: 'available' }), 'PUT'),
			db,
			tripA,
			newItem
		);
		expect(missingOwner.status).toBe(409);

		const connected = await handleSaveGearItem(
			request(itemInput({ availability: 'available', ownerIds: [alice] }), 'PUT'),
			db,
			tripA,
			newItem
		);
		expect(connected.status).toBe(200);
		expect(loadGearPageData(db, tripA).items.find((item) => item.id === newItem)).toMatchObject({
			availability: 'available',
			ownerIds: [alice],
			selected: true
		});
	});
});
