import type { OpenFreeMapRestaurant } from '../domain/openfreemap';

type RenderedPoiFeature = {
	geometry: { type: string; coordinates?: unknown };
	properties: Record<string, unknown> | null;
};

function propertyString(properties: Record<string, unknown>, names: readonly string[]): string {
	for (const name of names) {
		const value = properties[name];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return '';
}

export function openFreeMapRestaurant(
	feature: RenderedPoiFeature
): OpenFreeMapRestaurant | undefined {
	if (feature.geometry.type !== 'Point' || !feature.properties) return undefined;
	const categories = ['class', 'subclass'].map((name) => feature.properties?.[name]);
	if (!categories.includes('restaurant')) return undefined;
	const coordinates = feature.geometry.coordinates;
	if (
		!Array.isArray(coordinates) ||
		coordinates.length < 2 ||
		typeof coordinates[0] !== 'number' ||
		typeof coordinates[1] !== 'number' ||
		!Number.isFinite(coordinates[0]) ||
		!Number.isFinite(coordinates[1]) ||
		coordinates[0] < -180 ||
		coordinates[0] > 180 ||
		coordinates[1] < -90 ||
		coordinates[1] > 90
	) {
		return undefined;
	}
	const title = propertyString(feature.properties, ['name', 'name:latin', 'name_en', 'name:en']);
	if (!title) return undefined;
	return {
		source: 'openfreemap',
		title: title.slice(0, 200),
		longitude: coordinates[0],
		latitude: coordinates[1],
		category: 'restaurant'
	};
}
