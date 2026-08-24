import { describe, expect, test } from 'vitest';

import {
	addShoppingListItemSchema,
	completeShoppingListItemSchema,
	editShoppingListItemSchema,
	sanitizeShoppingListText,
	shoppingListSnapshotSchema
} from './shoppinglist';

describe('shopping list', (): void => {
	test('preserves Bring item order', (): void => {
		const items = [
			{ sourceName: 'Bier', name: 'Øl', specification: '' },
			{ sourceName: 'Appelsin', name: 'Appelsin', specification: '4 stk' },
			{ sourceName: 'Ål', name: 'Ål', specification: '' }
		];

		const snapshot = shoppingListSnapshotSchema.parse({
			listUuid: 'trip-list',
			listName: 'Kroatia',
			items,
			recentItems: [],
			fetchedAt: '2026-08-21T10:00:00.000Z'
		});

		expect(snapshot.items.map((item) => item.name)).toEqual(['Øl', 'Appelsin', 'Ål']);
	});

	test('trims valid mutations and rejects unknown fields', (): void => {
		expect(addShoppingListItemSchema.parse({ name: ' Melk ', specification: ' 2 liter ' })).toEqual(
			{
				name: 'Melk',
				specification: '2 liter'
			}
		);
		expect(
			completeShoppingListItemSchema.safeParse({ sourceName: 'Milch', listUuid: 'other' }).success
		).toBe(false);
		expect(
			editShoppingListItemSchema.parse({ sourceName: ' Milch ', specification: ' 1 liter ' })
		).toEqual({ sourceName: 'Milch', specification: '1 liter' });
		expect(
			addShoppingListItemSchema.safeParse({ name: 'Melk&remove=Alt', specification: '' }).success
		).toBe(false);
		expect(addShoppingListItemSchema.safeParse({ name: 'A+B', specification: '' }).success).toBe(
			false
		);
	});

	test('removes Bring control characters while preserving letters', (): void => {
		expect(sanitizeShoppingListText('Øl&Bröd+=\n')).toBe('ØlBröd');
	});
});
