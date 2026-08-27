import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';
import { menuActiveSchema, menuArchiveSchema } from '$lib/modules/menu/domain/menu';

import {
	handleActivateRecipe,
	handleArchiveRecipe,
	handleCreateRecipe,
	handleUpdateMenuEntry,
	handleUpdateRecipe,
	listRecipeArchive,
	listTripMenu
} from './library';

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;
const firstTripId = '9e20d5cf-5371-4186-b6ef-31f12948e6bd';
const secondTripId = 'b4ca59d5-aa23-4424-a981-f7eac018467d';
const recipeId = 'a12ff20b-4ca7-42e7-a466-7f5bb17e5148';

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-menu-library-'));
	db = createApplicationDatabase(dataDir);
	const insert = db.prepare(
		`INSERT INTO trips
		 (id, slug, name, timezone, status, visibility, welcome_text, created_at, updated_at)
		 VALUES (?, ?, ?, 'Europe/Oslo', 'active', 'listed', 'Velkommen', ?, ?)`
	);
	insert.run(firstTripId, 'first', 'First', '2026-08-27', '2026-08-27');
	insert.run(secondTripId, 'second', 'Second', '2026-08-27', '2026-08-27');
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function request(body: unknown, method = 'POST'): Request {
	return new Request('http://localhost/api/menu', {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function recipe(name: string, ingredientName: string) {
	return menuArchiveSchema.parse({
		version: 1,
		id: recipeId,
		name,
		baseServings: 4,
		defaultPlannedServings: 4,
		ingredients: [
			{
				id: 'a222f67f-a962-493e-906f-ee7e38da7e5d',
				group: '',
				quantityText: '1',
				unit: 'kg',
				name: ingredientName,
				note: ''
			}
		],
		instructions: [],
		createdAt: '2026-08-27T10:00:00.000Z',
		createdBy: 'client-a',
		tombstone: false
	});
}

function active(plannedServings: number, cycleId: string) {
	return menuActiveSchema.parse({
		version: 1,
		archiveId: recipeId,
		cycleId,
		categories: ['dinner'],
		plannedServings,
		activatedAt: '2026-08-27T10:00:00.000Z',
		activatedBy: 'client-a',
		tombstone: false
	});
}

describe('global recipe library', (): void => {
	test('keeps immutable versions global and menu selections trip-specific', async (): Promise<void> => {
		const created = await handleCreateRecipe(
			request({ recipe: recipe('Pasta', 'Tomat') }),
			db,
			() => new Date('2026-08-27T10:00:00.000Z')
		);
		expect(created.status).toBe(200);
		expect(listRecipeArchive(db)).toMatchObject([
			{ id: recipeId, name: 'Pasta', recipeVersion: 1 }
		]);

		await handleActivateRecipe(
			request({ active: active(4, '419ed72b-bc95-4824-8ea7-5465bef96a5e') }),
			db,
			firstTripId
		);
		const firstEntry = listTripMenu(db, firstTripId)[0];
		expect(firstEntry).toMatchObject({
			archive: { name: 'Pasta', recipeVersion: 1 },
			active: { plannedServings: 4 },
			latestRecipeVersion: 1
		});
		expect(listTripMenu(db, secondTripId)).toEqual([]);

		await handleUpdateRecipe(
			request({ recipe: recipe('Pasta med tomat', 'Cherrytomat') }, 'PUT'),
			db,
			recipeId,
			() => new Date('2026-08-27T11:00:00.000Z')
		);
		expect(listRecipeArchive(db)[0]).toMatchObject({
			name: 'Pasta med tomat',
			recipeVersion: 2
		});
		expect(listTripMenu(db, firstTripId)[0]).toMatchObject({
			archive: { name: 'Pasta', recipeVersion: 1 },
			latestRecipeVersion: 2
		});
		expect(
			JSON.parse(
				(
					db
						.prepare('SELECT value FROM recipe_versions WHERE recipe_id = ? AND version = 1')
						.get(recipeId) as { value: string }
				).value
			).ingredients[0].name
		).toBe('Tomat');

		await handleUpdateMenuEntry(
			request({ useLatest: true }, 'PATCH'),
			db,
			firstTripId,
			firstEntry!.entryId
		);
		expect(listTripMenu(db, firstTripId)[0]).toMatchObject({
			archive: { name: 'Pasta med tomat', recipeVersion: 2 },
			active: { plannedServings: 4 }
		});

		await handleActivateRecipe(
			request({ active: active(8, '6526306e-feb3-42f2-8042-3bdd55b05e77') }),
			db,
			secondTripId
		);
		expect(listTripMenu(db, secondTripId)[0]).toMatchObject({
			archive: { recipeVersion: 2 },
			active: { plannedServings: 8 }
		});
		expect(listTripMenu(db, firstTripId)[0]?.active.plannedServings).toBe(4);
	});

	test('soft-archives recipes without breaking active trip entries', async (): Promise<void> => {
		await handleCreateRecipe(request({ recipe: recipe('Pasta', 'Tomat') }), db);
		await handleActivateRecipe(
			request({ active: active(4, '419ed72b-bc95-4824-8ea7-5465bef96a5e') }),
			db,
			firstTripId
		);

		const response = handleArchiveRecipe(db, recipeId);

		expect(response.status).toBe(200);
		expect(listRecipeArchive(db)).toEqual([]);
		expect(listTripMenu(db, firstTripId)).toMatchObject([
			{ archive: { id: recipeId, name: 'Pasta' } }
		]);
		expect(
			(
				db.prepare('SELECT COUNT(*) AS count FROM recipes WHERE id = ?').get(recipeId) as {
					count: number;
				}
			).count
		).toBe(1);
	});
});
