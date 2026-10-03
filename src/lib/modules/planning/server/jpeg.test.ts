import { describe, expect, it } from 'vitest';

import { jpegDimensions } from './jpeg';

const frame = (marker: number, width: number, height: number): number[] => [
	0xff,
	marker,
	0x00,
	0x11,
	0x08,
	height >> 8,
	height & 0xff,
	width >> 8,
	width & 0xff,
	0x03,
	...Array.from({ length: 9 }, () => 0)
];
const application = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46];

describe('jpegDimensions', () => {
	it.each([
		[
			'a baseline frame',
			[0xff, 0xd8, ...frame(0xc0, 640, 480), 0xff, 0xd9],
			{ width: 640, height: 480 }
		],
		[
			'a progressive frame after an application segment and fill byte',
			[0xff, 0xd8, ...application, 0xff, ...frame(0xc2, 2048, 1536)],
			{ width: 2048, height: 1536 }
		],
		['scan data before any frame', [0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9], undefined],
		['a PNG signature', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], undefined],
		['a truncated frame', [0xff, 0xd8, ...frame(0xc0, 640, 480).slice(0, 6)], undefined],
		['a zero width', [0xff, 0xd8, ...frame(0xc0, 0, 480)], undefined]
	])('reads %s', (_, bytes, expected) => {
		expect(jpegDimensions(new Uint8Array(bytes))).toEqual(expected);
	});
});
