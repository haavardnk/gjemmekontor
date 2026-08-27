import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';

import {
	filterGearItems,
	gearCategories,
	type GearCategory,
	gearCategoryKey,
	type GearItem,
	gearItemKey,
	gearItems,
	type GearOwner,
	gearOwnerKey,
	gearOwners,
	gearPackedKey,
	gearPlannedKey,
	gearProgress,
	isGearItemPlanned,
	type KeyedGearItem,
	repositionGearCategory,
	serializeGearCategory,
	serializeGearItem,
	serializeGearOwner,
	sortGearItems
} from './gear';

const ownerId = '00000000-0000-4000-8000-000000000001';
const secondOwnerId = '00000000-0000-4000-8000-000000000002';
const categoryId = '00000000-0000-4000-8000-000000000003';
const secondCategoryId = '00000000-0000-4000-8000-000000000004';
const itemId = '00000000-0000-4000-8000-000000000005';
const secondItemId = '00000000-0000-4000-8000-000000000006';
const createdAt = '2026-08-26T10:00:00.000Z';

function owner(id = ownerId, name = 'Åse'): GearOwner {
	return { version: 1, id, name, createdAt, createdBy: 'client-a', tombstone: false };
}

function category(id = categoryId, name = 'Sikkerhet', position = 0): GearCategory {
	return {
		version: 1,
		id,
		name,
		position,
		createdAt,
		createdBy: 'client-a',
		tombstone: false
	};
}

function item(overrides: Partial<GearItem> = {}): GearItem {
	return {
		version: 1,
		id: itemId,
		categoryId,
		name: 'Redningsvest',
		quantity: 1,
		ownerId,
		availability: 'available',
		notes: 'Automatisk vest',
		createdAt,
		createdBy: 'client-a',
		tombstone: false,
		...overrides
	};
}

describe('gear domain', (): void => {
	test('reads valid records and ignores malformed, mismatched, and deleted values', (): void => {
		const deletedOwner = { ...owner(secondOwnerId, 'Bjørn'), tombstone: true };
		const values: Record<string, JsonValue> = {
			[gearOwnerKey(ownerId)]: serializeGearOwner(owner()),
			[gearOwnerKey(secondOwnerId)]: serializeGearOwner(deletedOwner),
			[gearOwnerKey('wrong')]: serializeGearOwner(owner(secondOwnerId, 'Bjørn')),
			[gearCategoryKey(categoryId)]: serializeGearCategory(category()),
			[gearItemKey(itemId)]: serializeGearItem(item()),
			'gear:item:broken': { name: 'Ugyldig' }
		};

		expect(gearOwners(values).map((entry) => entry.name)).toEqual(['Åse']);
		expect(gearCategories(values).map((entry) => entry.name)).toEqual(['Sikkerhet']);
		expect(gearItems(values).map((entry) => entry.name)).toEqual(['Redningsvest']);
	});

	test('filters across item, notes, category, and owner and supports owner and availability', (): void => {
		const entries = [
			{ key: gearItemKey(itemId), ...item() },
			{
				key: gearItemKey(secondItemId),
				...item({
					id: secondItemId,
					name: 'USB-lader',
					categoryId: secondCategoryId,
					ownerId: secondOwnerId,
					availability: 'need-to-buy',
					notes: 'To porter'
				})
			}
		];
		const categoryNames = new Map([
			[categoryId, 'Sikkerhet'],
			[secondCategoryId, 'Elektronikk']
		]);
		const ownerNames = new Map([
			[ownerId, 'Åse'],
			[secondOwnerId, 'Bjørn']
		]);

		expect(filterGearItems(entries, { query: 'automatisk' }).map((entry) => entry.id)).toEqual([
			itemId
		]);
		expect(
			filterGearItems(entries, { query: 'elektronikk', categoryNames }).map((entry) => entry.id)
		).toEqual([secondItemId]);
		expect(
			filterGearItems(entries, { query: 'bjørn', ownerNames }).map((entry) => entry.id)
		).toEqual([secondItemId]);
		expect(filterGearItems(entries, { ownerId }).map((entry) => entry.id)).toEqual([itemId]);
		expect(
			filterGearItems(entries, { availability: 'need-to-buy' }).map((entry) => entry.id)
		).toEqual([secondItemId]);
		expect(
			filterGearItems(entries, { categoryId: secondCategoryId }).map((entry) => entry.id)
		).toEqual([secondItemId]);
		expect(
			filterGearItems(entries, {
				planned: false,
				values: { [gearPlannedKey(secondItemId)]: false }
			}).map((entry) => entry.id)
		).toEqual([secondItemId]);
	});

	test('treats existing gear without membership state as planned', (): void => {
		expect(isGearItemPlanned({}, itemId)).toBe(true);
		expect(isGearItemPlanned({ [gearPlannedKey(itemId)]: true }, itemId)).toBe(true);
		expect(isGearItemPlanned({ [gearPlannedKey(itemId)]: false }, itemId)).toBe(false);
	});

	test('counts only available items in packing progress', (): void => {
		const items = [item(), item({ id: secondItemId, availability: 'need-to-buy' })];
		const values = { [gearPackedKey(itemId)]: true };

		expect(gearProgress(items, values)).toEqual({ packed: 1, total: 1, needToBuy: 1 });
	});

	test('sorts by category, owner, availability, and unpacked state with name as fallback', (): void => {
		const entries: KeyedGearItem[] = [
			{ key: gearItemKey(itemId), ...item({ name: 'Vest' }) },
			{
				key: gearItemKey(secondItemId),
				...item({
					id: secondItemId,
					name: 'Lader',
					ownerId: secondOwnerId,
					availability: 'need-to-buy'
				})
			}
		];
		const ownerNames = new Map([
			[ownerId, 'Åse'],
			[secondOwnerId, 'Bjørn']
		]);
		const categoryNames = new Map([
			[categoryId, 'Sikkerhet'],
			[secondCategoryId, 'Elektronikk']
		]);

		expect(
			sortGearItems(
				[entries[0]!, { ...entries[1]!, categoryId: secondCategoryId }],
				'category',
				{},
				ownerNames,
				categoryNames
			).map((entry) => entry.name)
		).toEqual(['Lader', 'Vest']);

		expect(sortGearItems(entries, 'owner', {}, ownerNames).map((entry) => entry.name)).toEqual([
			'Lader',
			'Vest'
		]);
		expect(
			sortGearItems(entries, 'availability', {}, ownerNames).map((entry) => entry.name)
		).toEqual(['Lader', 'Vest']);
		expect(
			sortGearItems(entries, 'unpacked', { [gearPackedKey(itemId)]: true }, ownerNames).map(
				(entry) => entry.name
			)
		).toEqual(['Lader', 'Vest']);
	});

	test('repositions categories and normalizes every position', (): void => {
		const first = { key: gearCategoryKey(categoryId), ...category() };
		const second = {
			key: gearCategoryKey(secondCategoryId),
			...category(secondCategoryId, 'Elektronikk', 4)
		};

		expect(repositionGearCategory([first, second], secondCategoryId, 0)).toEqual([
			{ ...category(secondCategoryId, 'Elektronikk', 4), position: 0 },
			{ ...category(), position: 1 }
		]);
	});
});
