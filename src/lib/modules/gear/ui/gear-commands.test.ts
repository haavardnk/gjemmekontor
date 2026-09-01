import { describe, expect, test } from 'vitest';

import type { GearItemView, GearPageData } from '../domain/gear';
import {
	markGearItemAvailable,
	resetGearPacking,
	saveGearCategory,
	saveGearItem,
	setGearItemPlanned
} from './gear-commands';

const ownerId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';

function item(overrides: Partial<GearItemView> = {}): GearItemView {
	return {
		id: itemId,
		categoryId,
		name: 'Jakke',
		quantity: 1,
		ownerIds: [ownerId],
		availability: 'available',
		notes: '',
		selected: true,
		packed: true,
		needsOwnerResolution: false,
		retainedWithoutCurrentOwner: false,
		...overrides
	};
}

function data(items = [item()]): GearPageData {
	return {
		people: [{ id: ownerId, name: 'Ada', activeTripMember: true }],
		categories: [{ id: categoryId, name: 'Klær', position: 0 }],
		items
	};
}

describe('gear command plans', (): void => {
	test('builds category and item upserts with optimistic snapshots', (): void => {
		const category = saveGearCategory(data(), { name: 'Elektronikk' }, () => 'new-category');
		expect(category.next.categories.at(-1)).toEqual({
			id: 'new-category',
			name: 'Elektronikk',
			position: 1
		});
		expect(category.requests[0]).toMatchObject({ path: '/api/gear/categories', method: 'POST' });

		const savedItem = saveGearItem(
			data([]),
			{
				categoryId,
				name: ' Lader ',
				quantity: 2,
				ownerIds: [ownerId],
				availability: 'available',
				notes: ' USB-C ',
				planned: true
			},
			() => 'new-item'
		);
		expect(savedItem.next.items[0]).toMatchObject({
			id: 'new-item',
			name: 'Lader',
			notes: 'USB-C'
		});
		expect(savedItem.requests[0]).toMatchObject({ path: '/api/gear/items', method: 'POST' });
	});

	test('keeps packing and availability invariants in the command layer', (): void => {
		const removed = setGearItemPlanned(data(), itemId, false);
		expect(removed.next.items[0]).toMatchObject({ selected: false, packed: false });

		const reset = resetGearPacking(data());
		expect(reset.next.items[0]?.packed).toBe(false);
		expect(reset.requests).toHaveLength(1);

		const available = markGearItemAvailable(
			data([item({ availability: 'need-to-buy', needsOwnerResolution: true })]),
			itemId
		);
		expect(available.next.items[0]).toMatchObject({
			availability: 'available',
			selected: true,
			needsOwnerResolution: false
		});
	});

	test('rejects duplicate categories and availability without a current owner', (): void => {
		expect(() => saveGearCategory(data(), { name: ' klær ' })).toThrow('GEAR_CATEGORY_DUPLICATE');
		expect(() =>
			markGearItemAvailable(
				{ ...data(), people: [{ id: ownerId, name: 'Ada', activeTripMember: false }] },
				itemId
			)
		).toThrow('GEAR_OWNER_REQUIRED');
	});
});
