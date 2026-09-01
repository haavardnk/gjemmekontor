import {
	Anchor,
	Binoculars,
	Coffee,
	IceCreamBowl,
	LifeBuoy,
	Martini,
	Sailboat,
	ShoppingBasket,
	UtensilsCrossed
} from 'lucide';

import type { MapPointSymbol } from '../domain/types';

const markerIcons: Record<MapPointSymbol, typeof Anchor> = {
	anchorage: Anchor,
	bar: Martini,
	'buoy-field': LifeBuoy,
	cafe: Coffee,
	dessert: IceCreamBowl,
	marina: Sailboat,
	restaurant: UtensilsCrossed,
	shop: ShoppingBasket,
	poi: Binoculars
};

function canvasContext(width: number, height: number): CanvasRenderingContext2D {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('CANVAS_UNAVAILABLE');
	return context;
}

function drawMarkerIcon(context: CanvasRenderingContext2D, symbol: MapPointSymbol): void {
	context.save();
	context.translate(26, 20);
	context.scale(1.15, 1.15);
	context.strokeStyle = '#17343c';
	context.lineWidth = 2.4;
	context.lineCap = 'round';
	context.lineJoin = 'round';
	for (const [tag, attributes] of markerIcons[symbol] ?? Binoculars) {
		if (tag === 'path' && typeof attributes.d === 'string') {
			context.stroke(new Path2D(attributes.d));
		}
		if (tag === 'circle') {
			context.beginPath();
			context.arc(
				Number(attributes.cx),
				Number(attributes.cy),
				Number(attributes.r),
				0,
				Math.PI * 2
			);
			context.stroke();
		}
	}
	context.restore();
}

export function pinImage(color: string, symbol: MapPointSymbol, selected: boolean): ImageData {
	const context = canvasContext(80, 96);
	context.beginPath();
	context.moveTo(40, 90);
	context.bezierCurveTo(34, 76, 12, 55, 12, 34);
	context.arc(40, 34, 28, Math.PI, 0);
	context.bezierCurveTo(68, 55, 46, 76, 40, 90);
	context.closePath();
	context.lineJoin = 'round';
	if (selected) {
		context.strokeStyle = '#123844';
		context.lineWidth = 13;
		context.stroke();
		context.strokeStyle = '#ffffff';
		context.lineWidth = 8;
		context.stroke();
	}
	context.fillStyle = color;
	context.fill();
	context.strokeStyle = '#ffffff';
	context.lineWidth = 4;
	context.stroke();
	context.beginPath();
	context.arc(40, 34, 18, 0, Math.PI * 2);
	context.fillStyle = '#ffffff';
	context.fill();
	drawMarkerIcon(context, symbol);
	return context.getImageData(0, 0, 80, 96);
}

async function imageData(
	path: string,
	size: number,
	errorCode: string,
	fitWithin?: number
): Promise<ImageData> {
	const response = await fetch(path);
	if (!response.ok) throw new Error(errorCode);
	const bitmap = await createImageBitmap(await response.blob());
	try {
		const context = canvasContext(size, size);
		if (fitWithin) {
			const scale = Math.min(fitWithin / bitmap.width, fitWithin / bitmap.height);
			const width = bitmap.width * scale;
			const height = bitmap.height * scale;
			context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
		} else {
			context.drawImage(bitmap, 0, 0, size, size);
		}
		return context.getImageData(0, 0, size, size);
	} finally {
		bitmap.close();
	}
}

function flipHorizontally(image: ImageData): ImageData {
	const source = canvasContext(image.width, image.height);
	source.putImageData(image, 0, 0);
	const target = canvasContext(image.width, image.height);
	target.translate(image.width, 0);
	target.scale(-1, 1);
	target.drawImage(source.canvas, 0, 0);
	return target.getImageData(0, 0, image.width, image.height);
}

export async function loadMapMarkerImages(): Promise<{
	position: ImageData;
	positionFlipped: ImageData;
	ais: ImageData;
	aisFlipped: ImageData;
}> {
	const [position, ais] = await Promise.all([
		imageData('/monsieur-bintang.png', 128, 'POSITION_MARKER_UNAVAILABLE', 112),
		imageData('/flamingo-vessel.png', 256, 'AIS_MARKER_UNAVAILABLE')
	]);
	return {
		position,
		positionFlipped: flipHorizontally(position),
		ais,
		aisFlipped: flipHorizontally(ais)
	};
}
