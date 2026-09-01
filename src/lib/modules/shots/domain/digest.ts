import { z } from 'zod';

import type { JsonValue } from '$lib/client/database';

export const mediaRowSchema = z.object({
	description: z.string().max(500),
	camera: z.string().trim().min(1).max(100),
	customCamera: z.string().max(100),
	filename: z.string().max(200),
	createdAt: z.string(),
	createdBy: z.string().min(1),
	tombstone: z.boolean()
});

export type MediaRow = z.infer<typeof mediaRowSchema>;

export type KeyedMediaRow = MediaRow & {
	key: string;
};

export function mediaKey(dayIndex: number, id: string): string {
	return `digest:d${dayIndex}:video:${id}`;
}

export function mediaRows(values: Record<string, JsonValue>, dayIndex: number): KeyedMediaRow[] {
	const prefix = `digest:d${dayIndex}:video:`;
	return Object.entries(values)
		.filter(([key]) => key.startsWith(prefix))
		.flatMap(([key, value]) => {
			const parsed = mediaRowSchema.safeParse(value);
			return parsed.success && !parsed.data.tombstone ? [{ key, ...parsed.data }] : [];
		})
		.sort(
			(left, right) =>
				left.createdAt.localeCompare(right.createdAt) || left.key.localeCompare(right.key)
		);
}

export function serializeMediaRow(row: MediaRow): JsonValue {
	return {
		description: row.description,
		camera: row.camera,
		customCamera: row.customCamera,
		filename: row.filename,
		createdAt: row.createdAt,
		createdBy: row.createdBy,
		tombstone: row.tombstone
	};
}
