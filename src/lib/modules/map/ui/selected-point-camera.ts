import type { Map as MapLibreMap } from 'maplibre-gl';

import type { Position } from '../domain/types';

export function focusSelectedPoint({
	map,
	container,
	coordinates,
	isSelected
}: {
	map: MapLibreMap;
	container: HTMLElement;
	coordinates: Position;
	isSelected: () => boolean;
}): () => void {
	if (window.innerWidth >= 1024) {
		map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 13) });
		return (): void => undefined;
	}
	let frame: number | undefined;
	let observer: ResizeObserver | undefined;
	const centerInVisibleBand = (): void => {
		if (!isSelected()) return;
		const mapBounds = container.getBoundingClientRect();
		const controls = document.querySelector<HTMLElement>('[data-map-controls]');
		const sheet = document.querySelector<HTMLElement>('[data-poi-sheet]');
		const visibleTop = Math.max(
			(controls?.getBoundingClientRect().bottom ?? mapBounds.top) - mapBounds.top,
			0
		);
		const sheetTop = sheet?.getBoundingClientRect().top ?? mapBounds.bottom;
		const visibleBottom = Math.min(sheetTop - mapBounds.top, mapBounds.height);
		const targetY = visibleTop + Math.max(0, visibleBottom - visibleTop) / 2;
		map.easeTo({ center: coordinates, offset: [0, targetY - mapBounds.height / 2] });
	};
	const observeVisibleBand = (): void => {
		centerInVisibleBand();
		const controls = document.querySelector<HTMLElement>('[data-map-controls]');
		const sheet = document.querySelector<HTMLElement>('[data-poi-sheet]');
		if (!sheet) {
			frame = requestAnimationFrame(observeVisibleBand);
			return;
		}
		observer = new ResizeObserver((): void => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(centerInVisibleBand);
		});
		if (controls) observer.observe(controls);
		observer.observe(sheet);
		observer.observe(container);
	};
	frame = requestAnimationFrame(observeVisibleBand);
	return (): void => {
		if (frame !== undefined) cancelAnimationFrame(frame);
		observer?.disconnect();
	};
}
