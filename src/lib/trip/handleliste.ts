import { z } from 'zod';

function isBringText(value: string): boolean {
	return (
		!value.includes('&') &&
		!value.includes('=') &&
		!value.includes('+') &&
		[...value].every((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return codePoint >= 32 && codePoint !== 127;
		})
	);
}

const bringTextSchema = (maximum: number) => z.string().trim().max(maximum).refine(isBringText);

export const handlelisteItemSchema = z.object({
	sourceName: bringTextSchema(100).pipe(z.string().min(1)),
	name: bringTextSchema(100).pipe(z.string().min(1)),
	specification: bringTextSchema(120)
});

export const handlelisteSnapshotSchema = z.object({
	listUuid: z.string().min(1).max(100),
	listName: z.string().min(1).max(200),
	items: z.array(handlelisteItemSchema),
	recentItems: z.array(handlelisteItemSchema),
	fetchedAt: z.iso.datetime()
});

export const addHandlelisteItemSchema = z
	.object({
		name: bringTextSchema(100).pipe(z.string().min(1)),
		specification: bringTextSchema(120)
	})
	.strict();
export const completeHandlelisteItemSchema = z
	.object({ sourceName: bringTextSchema(100).pipe(z.string().min(1)) })
	.strict();
export const editHandlelisteItemSchema = z
	.object({
		sourceName: bringTextSchema(100).pipe(z.string().min(1)),
		specification: bringTextSchema(120)
	})
	.strict();

export type HandlelisteItem = z.infer<typeof handlelisteItemSchema>;
export type HandlelisteSnapshot = z.infer<typeof handlelisteSnapshotSchema>;
