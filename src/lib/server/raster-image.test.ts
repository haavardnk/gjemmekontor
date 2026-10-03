import { describe, expect, test } from 'vitest';

import { hasRasterSignature } from './raster-image';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const ascii = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));

describe('raster image signatures', (): void => {
	test.each([
		['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0), true],
		['image/jpeg', bytes(0x89, 0x50, 0x4e, 0x47), false],
		['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), true],
		['image/gif', bytes(...ascii('GIF89a')), true],
		['image/webp', bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')), true],
		['image/avif', bytes(0, 0, 0, 0, ...ascii('ftypavif')), true],
		['image/svg+xml', bytes(...ascii('<svg')), false]
	])('%s matches expected signature', (type, body, expected): void => {
		expect(hasRasterSignature(type, body)).toBe(expected);
	});
});
