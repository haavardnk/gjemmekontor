import { describe, expect, test } from 'vitest';

import {
	filterGearItems,
	type GearCategory,
	type GearItemView,
	gearProgress,
	repositionGearCategory,
	sortGearItems
} from './gear';

const ownerId = '00000000-0000-4000-8000-000000000001';
const secondOwnerId = '00000000-0000-4000-8000-000000000002';
const categoryId = '00000000-0000-4000-8000-000000000003';
const secondCategoryId = '00000000-0000-4000-8000-000000000004';
const itemId = '00000000-0000-4000-8000-000000000005';
const secondItemId = '00000000-0000-4000-8000-000000000006';

function item(overrides: Partial<GearItemView> = {}): GearItemView {
	return {
		id: itemId,
		categoryId,
		name: 'Redningsvest',
		quantity: 1,
		ownerIds: [ownerId],
		availability: 'available',
		notes: 'Automatisk vest',
		selected: true,
		packed: false,
		needsOwnerResolution: false,
		retainedWithoutCurrentOwner: false,
		...overrides
	};
}

describe('gear domain', (): void => {
	test('filters across item, notes, category, owner, availability, and plan state', (): void => {
		const entries = [
			item(),
			item({
				id: secondItemId,
				name: 'USB-lader',
				categoryId: secondCategoryId,
				ownerIds: [secondOwnerId],
				availability: 'need-to-buy',
				notes: 'To porter',
				selected: false
			})
		];
		const categoryNames = new Map([
			[categoryId, 'Sikkerhet'],
			[secondCategoryId, 'Elektronikk']
		]);
		const ownerNames = new Map([
			[ownerId, 'Åse'],
			[secondOwnerId, 'Bjørn']
		]);

		expect(filterGearItems(entries, { query: 'automatisk' }).map(({ id }) => id)).toEqual([itemId]);
		expect(
			filterGearItems(entries, { query: 'elektronikk', categoryNames }).map(({ id }) => id)
		).toEqual([secondItemId]);
		expect(filterGearItems(entries, { query: 'bjørn', ownerNames }).map(({ id }) => id)).toEqual([
			secondItemId
		]);
		expect(filterGearItems(entries, { ownerId }).map(({ id }) => id)).toEqual([itemId]);
		expect(filterGearItems(entries, { availability: 'need-to-buy' }).map(({ id }) => id)).toEqual([
			secondItemId
		]);
		expect(filterGearItems(entries, { planned: false }).map(({ id }) => id)).toEqual([
			secondItemId
		]);
	});

	test('counts only available items in packing progress', (): void => {
		const items = [item({ packed: true }), item({ id: secondItemId, availability: 'need-to-buy' })];

		expect(gearProgress(items)).toEqual({ packed: 1, total: 1, needToBuy: 1 });
	});

	test('sorts by category, owner, availability, and unpacked state', (): void => {
		const entries = [
			item({ name: 'Vest', packed: true }),
			item({
				id: secondItemId,
				name: 'Lader',
				categoryId: secondCategoryId,
				ownerIds: [secondOwnerId],
				availability: 'need-to-buy'
			})
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
			sortGearItems(entries, 'category', ownerNames, categoryNames).map(({ name }) => name)
		).toEqual(['Lader', 'Vest']);
		expect(sortGearItems(entries, 'owner', ownerNames).map(({ name }) => name)).toEqual([
			'Lader',
			'Vest'
		]);
		expect(sortGearItems(entries, 'availability', ownerNames).map(({ name }) => name)).toEqual([
			'Lader',
			'Vest'
		]);
		expect(sortGearItems(entries, 'unpacked', ownerNames).map(({ name }) => name)).toEqual([
			'Lader',
			'Vest'
		]);
	});

	test('repositions categories and normalizes every position', (): void => {
		const first: GearCategory = { id: categoryId, name: 'Sikkerhet', position: 0 };
		const second: GearCategory = {
			id: secondCategoryId,
			name: 'Elektronikk',
			position: 4
		};

		expect(repositionGearCategory([first, second], secondCategoryId, 0)).toEqual([
			{ ...second, position: 0 },
			{ ...first, position: 1 }
		]);
	});
});
