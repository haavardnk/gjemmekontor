import { describe, expect, test } from 'vitest';

import { loadMapCamera, mapCameraStorageKey, removeMapCamera, storeMapCamera } from './camera';

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		removeItem: (key: string) => values.delete(key),
		setItem: (key: string, value: string) => values.set(key, value)
	};
}

describe('map camera storage', (): void => {
	test('round trips a valid trip camera', (): void => {
		const storage = memoryStorage();
		const key = mapCameraStorageKey('trip-id');
		const camera = { center: [16.4, 43.5] as [number, number], zoom: 12, bearing: 32, pitch: 4 };

		storeMapCamera(storage, key, camera);
		expect(loadMapCamera(storage, key)).toEqual(camera);
		removeMapCamera(storage, key);
		expect(loadMapCamera(storage, key)).toBeUndefined();
	});

	test.each([
		'{',
		JSON.stringify({ center: [181, 0], zoom: 12, bearing: 0, pitch: 0 }),
		JSON.stringify({ center: [16, 43], zoom: 25, bearing: 0, pitch: 0 }),
		JSON.stringify({ center: [16, 43], zoom: 12, bearing: 0, pitch: 86 })
	])('rejects an invalid stored camera', (value): void => {
		const storage = memoryStorage();
		storage.setItem('camera', value);
		expect(loadMapCamera(storage, 'camera')).toBeUndefined();
	});
});
