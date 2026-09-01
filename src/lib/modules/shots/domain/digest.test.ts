import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';

import { mediaKey, type MediaRow, mediaRows, serializeMediaRow } from './digest';

const first: MediaRow = {
	description: 'Seilene går opp',
	camera: 'Testkamera',
	customCamera: '',
	filename: 'A001.mp4',
	createdAt: '2027-06-01T10:00:00.000Z',
	createdBy: 'client-a',
	tombstone: false
};

describe('Digest media rows', (): void => {
	test.each([
		[0, 'row-a', 'digest:d0:video:row-a'],
		[18, 'row-b', 'digest:d18:video:row-b']
	] as const)('builds stable day media keys', (dayIndex, id, expected): void => {
		expect(mediaKey(dayIndex, id)).toBe(expected);
	});

	test('parses current rows, ignores other days and tombstones, and sorts stably', (): void => {
		const later = { ...first, createdAt: '2027-06-01T11:00:00.000Z' };
		const deleted = { ...first, tombstone: true };
		const values: Record<string, JsonValue> = {
			[mediaKey(0, 'later')]: serializeMediaRow(later),
			[mediaKey(0, 'first')]: serializeMediaRow(first),
			[mediaKey(0, 'deleted')]: serializeMediaRow(deleted),
			[mediaKey(1, 'other-day')]: serializeMediaRow(first),
			'digest:d0:photo:other-kind': serializeMediaRow(first),
			'digest:d0:video:invalid': null
		};

		expect(mediaRows(values, 0).map((row) => row.key)).toEqual([
			'digest:d0:video:first',
			'digest:d0:video:later'
		]);
	});
});
