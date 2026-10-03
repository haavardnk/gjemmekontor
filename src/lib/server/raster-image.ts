export const rasterImageTypes = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/avif'
] as const;

export type RasterImageType = (typeof rasterImageTypes)[number];

const text = new TextDecoder();

export function hasRasterSignature(contentType: string, body: Uint8Array): boolean {
	if (contentType === 'image/jpeg') return body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
	if (contentType === 'image/png') return body.slice(0, 8).toHex() === '89504e470d0a1a0a';
	if (contentType === 'image/gif') return text.decode(body.slice(0, 4)) === 'GIF8';
	if (contentType === 'image/webp') {
		return text.decode(body.slice(0, 4)) === 'RIFF' && text.decode(body.slice(8, 12)) === 'WEBP';
	}
	if (contentType === 'image/avif') {
		const brand = text.decode(body.slice(8, 12));
		return text.decode(body.slice(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(brand);
	}
	return false;
}
