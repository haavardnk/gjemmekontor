import { z } from 'zod';

export function sanitizeShoppingListText(value: string): string {
	return [...value]
		.filter((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return (
				character !== '&' &&
				character !== '=' &&
				character !== '+' &&
				codePoint >= 32 &&
				codePoint !== 127
			);
		})
		.join('');
}

function isBringText(value: string): boolean {
	return value === sanitizeShoppingListText(value);
}

const bringTextSchema = (maximum: number) => z.string().trim().max(maximum).refine(isBringText);

export const shoppingListItemSchema = z.object({
	sourceName: bringTextSchema(100).pipe(z.string().min(1)),
	name: bringTextSchema(100).pipe(z.string().min(1)),
	specification: bringTextSchema(120)
});

export const shoppingListSnapshotSchema = z.object({
	listUuid: z.string().min(1).max(100),
	listName: z.string().min(1).max(200),
	items: z.array(shoppingListItemSchema),
	recentItems: z.array(shoppingListItemSchema),
	fetchedAt: z.iso.datetime()
});

export const addShoppingListItemSchema = z
	.object({
		name: bringTextSchema(100).pipe(z.string().min(1)),
		specification: bringTextSchema(120)
	})
	.strict();
export const completeShoppingListItemSchema = z
	.object({ sourceName: bringTextSchema(100).pipe(z.string().min(1)) })
	.strict();
export const editShoppingListItemSchema = z
	.object({
		sourceName: bringTextSchema(100).pipe(z.string().min(1)),
		specification: bringTextSchema(120)
	})
	.strict();

export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;
export type ShoppingListSnapshot = z.infer<typeof shoppingListSnapshotSchema>;
