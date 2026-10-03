const startOfFrameMarkers = new Set([
	0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

export function jpegDimensions(body: Uint8Array): { width: number; height: number } | undefined {
	const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
	if (body.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;
	let offset = 2;
	while (offset + 4 <= body.byteLength) {
		if (view.getUint8(offset) !== 0xff) return undefined;
		const marker = view.getUint8(offset + 1);
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			offset += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) return undefined;
		const length = view.getUint16(offset + 2);
		if (length < 2) return undefined;
		if (startOfFrameMarkers.has(marker)) {
			if (length < 7 || offset + 9 > body.byteLength) return undefined;
			const height = view.getUint16(offset + 5);
			const width = view.getUint16(offset + 7);
			return width && height ? { width, height } : undefined;
		}
		offset += 2 + length;
	}
	return undefined;
}
