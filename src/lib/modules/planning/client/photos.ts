import { planningLimits } from '../domain/planning';

export type PlanningPhotoUpload = {
	id: string;
	width: number;
	height: number;
	full: Blob;
	thumb: Blob;
};

async function encodeJpeg(
	bitmap: ImageBitmap,
	maximumEdge: number,
	maximumBytes: number
): Promise<{ blob: Blob; width: number; height: number }> {
	const scale = Math.min(1, maximumEdge / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('PLANNING_PHOTO_UNREADABLE');
	context.fillStyle = '#ffffff';
	context.fillRect(0, 0, width, height);
	context.drawImage(bitmap, 0, 0, width, height);
	for (const quality of [0.85, 0.75, 0.6]) {
		const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
		if (blob.size <= maximumBytes) return { blob, width, height };
	}
	throw new Error('PLANNING_PHOTO_TOO_LARGE');
}

export async function preparePlanningPhoto(file: Blob): Promise<PlanningPhotoUpload> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const full = await encodeJpeg(bitmap, planningLimits.photoEdge, planningLimits.photoBytes);
		const thumb = await encodeJpeg(bitmap, planningLimits.thumbEdge, planningLimits.thumbBytes);
		return {
			id: crypto.randomUUID(),
			width: full.width,
			height: full.height,
			full: full.blob,
			thumb: thumb.blob
		};
	} finally {
		bitmap.close();
	}
}

export function pastedImages(event: ClipboardEvent): File[] {
	const target = event.target;
	const textTarget =
		target instanceof HTMLElement &&
		(target.isContentEditable || target.matches('input, textarea'));
	if (textTarget && event.clipboardData?.types.includes('text/plain')) return [];
	return [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
}
