import { describe, expect, test } from 'vitest';

import {
	addHandlelisteItemSchema,
	completeHandlelisteItemSchema,
	editHandlelisteItemSchema,
	handlelisteSnapshotSchema
} from './handleliste';

describe('handleliste', (): void => {
	test('preserves Bring item order', (): void => {
		const items = [
			{ sourceName: 'Bier', name: 'Øl', specification: '' },
			{ sourceName: 'Appelsin', name: 'Appelsin', specification: '4 stk' },
			{ sourceName: 'Ål', name: 'Ål', specification: '' }
		];

		const snapshot = handlelisteSnapshotSchema.parse({
			listUuid: 'trip-list',
			listName: 'Kroatia',
			items,
			recentItems: [],
			fetchedAt: '2026-08-21T10:00:00.000Z'
		});

		expect(snapshot.items.map((item) => item.name)).toEqual(['Øl', 'Appelsin', 'Ål']);
	});

	test('trims valid mutations and rejects unknown fields', (): void => {
		expect(addHandlelisteItemSchema.parse({ name: ' Melk ', specification: ' 2 liter ' })).toEqual({
			name: 'Melk',
			specification: '2 liter'
		});
		expect(
			completeHandlelisteItemSchema.safeParse({ sourceName: 'Milch', listUuid: 'other' }).success
		).toBe(false);
		expect(
			editHandlelisteItemSchema.parse({ sourceName: ' Milch ', specification: ' 1 liter ' })
		).toEqual({ sourceName: 'Milch', specification: '1 liter' });
		expect(
			addHandlelisteItemSchema.safeParse({ name: 'Melk&remove=Alt', specification: '' }).success
		).toBe(false);
		expect(addHandlelisteItemSchema.safeParse({ name: 'A+B', specification: '' }).success).toBe(
			false
		);
	});
});
