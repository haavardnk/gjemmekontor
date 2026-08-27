import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from './database';
import {
	importLegacyKroatia2026,
	kroatia2026Name,
	kroatia2026TripId,
	kroatia2026WelcomeText
} from './legacy-trip-import';

const temporaryDirectories: string[] = [];

afterEach((): void => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function database(): Database.Database {
	const dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-v2-import-'));
	temporaryDirectories.push(dataDir);
	return createApplicationDatabase(dataDir);
}

function stateValue(key: string, value: unknown, revision: number) {
	return {
		key,
		value: JSON.stringify(value),
		revision,
		clientId: 'fixture-client',
		mutationId: `mutation-${revision}`,
		updatedAt: `2026-08-2${revision}T10:00:00.000Z`
	};
}

function seedLegacyData(db: Database.Database): void {
	const values = [
		stateValue(
			'rule-book:game',
			{
				version: 1,
				status: 'active',
				participantOrder: [
					{ id: '0d01a972-9ca1-4b82-a938-1894dcea8c79', name: 'Håvard' },
					{ id: 'dd9f380b-0bba-41f2-bbc0-03a63dc24669', name: 'Tina' }
				],
				startedAt: '2026-08-27T06:29:46.968Z',
				startedBy: 'fixture-client'
			},
			1
		),
		stateValue(
			'gear:owner:c193d874-895e-474f-89e9-6874fd3b43ef',
			{
				version: 1,
				id: 'c193d874-895e-474f-89e9-6874fd3b43ef',
				name: 'Håvard',
				createdAt: '2026-08-26T20:43:09.635Z',
				createdBy: 'fixture-client',
				tombstone: false
			},
			2
		),
		stateValue(
			'gear:category:a5913e92-c01c-4beb-a2fc-cecdd3ad6282',
			{
				version: 1,
				id: 'a5913e92-c01c-4beb-a2fc-cecdd3ad6282',
				name: 'Kamera',
				position: 0,
				createdAt: '2026-08-26T20:44:09.635Z',
				createdBy: 'fixture-client',
				tombstone: false
			},
			3
		),
		stateValue(
			'gear:item:8691fb8c-7b58-4c60-835d-755af7e4a7de',
			{
				version: 1,
				id: '8691fb8c-7b58-4c60-835d-755af7e4a7de',
				categoryId: 'a5913e92-c01c-4beb-a2fc-cecdd3ad6282',
				name: 'Pocket 4',
				quantity: 1,
				ownerId: 'c193d874-895e-474f-89e9-6874fd3b43ef',
				availability: 'available',
				notes: '',
				createdAt: '2026-08-26T20:45:09.635Z',
				createdBy: 'fixture-client',
				tombstone: false
			},
			4
		),
		stateValue(
			'menu:archive:67d4e321-e380-4acc-8093-9bc4388cb79d',
			{
				version: 1,
				id: '67d4e321-e380-4acc-8093-9bc4388cb79d',
				name: 'Pasta',
				baseServings: 4,
				defaultPlannedServings: 4,
				ingredients: [],
				instructions: [],
				createdAt: '2026-08-25T12:14:16.451Z',
				createdBy: 'fixture-client',
				tombstone: false
			},
			5
		),
		stateValue(
			'menu:active:67d4e321-e380-4acc-8093-9bc4388cb79d',
			{
				version: 1,
				archiveId: '67d4e321-e380-4acc-8093-9bc4388cb79d',
				cycleId: '40d1bc99-c7fa-41cf-9a56-36d0e0f9b56d',
				categories: ['dinner'],
				plannedServings: 4,
				activatedAt: '2026-08-25T12:19:15.634Z',
				activatedBy: 'fixture-client',
				tombstone: false
			},
			6
		),
		stateValue('gear:packed:8691fb8c-7b58-4c60-835d-755af7e4a7de', true, 7)
	];
	const insertState = db.prepare(`
		INSERT INTO state_entries
		(key, value, revision, client_id, mutation_id, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
	const insertReceipt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
	for (const value of values) {
		insertState.run(
			value.key,
			value.value,
			value.revision,
			value.clientId,
			value.mutationId,
			value.updatedAt
		);
		insertReceipt.run(`mutation:${value.mutationId}`, String(value.revision));
	}
	db.prepare("UPDATE meta SET value = '7' WHERE key = 'global_revision'").run();
	db.prepare(
		`INSERT INTO gpx_uploads
		(id, leg_key, filename, content_type, checksum, byte_size, parser_version,
		 extraction, original, client_id, created_at)
		VALUES (?, ?, ?, 'application/gpx+xml', ?, 4, 1, '{}', ?, 'fixture-client', ?)`
	).run(
		'6cf7ec84-727f-4165-a157-5645d9455635',
		'logbook:d0:leg:4482ea93-f143-467a-8f12-d7dd76d1763b',
		'orca.gpx',
		'0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
		Buffer.from('gpx!'),
		'2026-08-21T17:11:15.643Z'
	);
	db.prepare(
		`INSERT INTO poi_provider_mappings
		(feature_id, provider, provider_id, source, mapped_at, query_version)
		VALUES ('feature-a', 'google', 'place-a', 'search', '2026-08-26T10:00:00.000Z', 1)`
	).run();
	db.prepare(
		`INSERT INTO poi_enrichment_cache
		(feature_id, provider, schema_version, payload, fetched_at, expires_at)
		VALUES ('feature-a', 'tripadvisor', 1, '{}',
		 '2026-08-26T10:00:00.000Z', '2026-09-26T10:00:00.000Z')`
	).run();
	db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)').run(
		'legacy-session',
		Date.now() + 60_000,
		Date.now()
	);
}

describe('Kroatia 2026 import', (): void => {
	test('imports all legacy scopes into the target model', () => {
		const db = database();
		seedLegacyData(db);

		const report = importLegacyKroatia2026(db, {
			now: new Date('2026-08-27T08:00:00.000Z')
		});

		expect(report).toEqual({
			tripId: kroatia2026TripId,
			stateEntries: 7,
			mutationReceipts: 7,
			people: 6,
			recipes: 1,
			menuEntries: 1,
			gearCategories: 1,
			gearItems: 1,
			gpxUploads: 1,
			gpxBytes: 4,
			mapMappings: 1,
			mapEnrichments: 1
		});
		expect(
			db.prepare('SELECT name, welcome_text, starts_on, ends_on, status FROM trips').get()
		).toEqual({
			name: kroatia2026Name,
			welcome_text: kroatia2026WelcomeText,
			starts_on: '2026-09-05',
			ends_on: '2026-09-23',
			status: 'draft'
		});
		expect(db.prepare('SELECT COUNT(*) AS count FROM trip_credentials').get()).toEqual({
			count: 0
		});
		expect(db.prepare('SELECT COUNT(*) AS count FROM trip_days WHERE active = 1').get()).toEqual({
			count: 19
		});
		expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 0 });
		expect(
			db
				.prepare(
					`SELECT i.name, p.display_name AS owner_name,
					        m.active AS owner_is_trip_member,
					        ti.active AS selected_for_trip,
					        packing.packed
					 FROM gear_items i
					 JOIN gear_item_owners owner ON owner.gear_item_id = i.id
					 JOIN people p ON p.id = owner.person_id
					 JOIN trip_members m ON m.trip_id = ? AND m.person_id = p.id
					 JOIN trip_gear_items ti ON ti.trip_id = m.trip_id AND ti.gear_item_id = i.id
					 LEFT JOIN trip_gear_packing packing
					 ON packing.trip_id = ti.trip_id AND packing.gear_item_id = ti.gear_item_id`
				)
				.get(kroatia2026TripId)
		).toEqual({
			name: 'Pocket 4',
			owner_name: 'Håvard',
			owner_is_trip_member: 1,
			selected_for_trip: 1,
			packed: 1
		});
		expect(
			db.prepare('SELECT COUNT(*) AS count FROM trip_member_module_preferences').get()
		).toEqual({ count: 4 });
		expect(
			db.prepare('SELECT COUNT(*) AS count FROM trip_modules WHERE enabled != 0').get()
		).toEqual({ count: 0 });
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM trip_modules WHERE config_json != '{}'").get()
		).toEqual({ count: 0 });
		expect(importLegacyKroatia2026(db)).toEqual(report);
		expect(db.pragma('foreign_key_check')).toEqual([]);
		db.close();
	});

	test('rolls back the complete import on invalid source data', () => {
		const db = database();
		db.prepare(
			`INSERT INTO state_entries
			(key, value, revision, client_id, mutation_id, updated_at)
			VALUES ('gear:item:broken', '{}', 1, 'fixture-client', 'broken', ?)`
		).run('2026-08-27T08:00:00.000Z');
		db.prepare("UPDATE meta SET value = '1' WHERE key = 'global_revision'").run();
		expect(() => importLegacyKroatia2026(db)).toThrow('INVALID_GEAR_ITEM');
		expect(db.prepare('SELECT COUNT(*) AS count FROM trips').get()).toEqual({ count: 0 });
		expect(db.prepare('SELECT COUNT(*) AS count FROM people').get()).toEqual({ count: 0 });
		db.close();
	});
});
