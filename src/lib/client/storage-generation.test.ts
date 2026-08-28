import 'fake-indexeddb/auto';

import { openDB } from 'idb';
import { beforeEach, describe, expect, test } from 'vitest';

import { discardPreTripClientStorage } from './storage-generation';

function storage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => void values.delete(key),
		setItem: (key, value) => void values.set(key, value)
	};
}

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage() });
	Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage() });
});

describe('client storage generation', () => {
	test('deletes only pre-trip state', async () => {
		const legacy = await openDB('gjemmekontor-data', 1, {
			upgrade(database): void {
				database.createObjectStore('state');
			}
		});
		legacy.close();
		localStorage.setItem('mapMode', 'satellite');
		localStorage.setItem('mapAisEnabled', 'false');
		localStorage.setItem('gjemmekontor-theme', 'dark');
		sessionStorage.setItem('mapCamera', '{}');

		await discardPreTripClientStorage();

		expect((await indexedDB.databases()).map((database) => database.name)).not.toContain(
			'gjemmekontor-data'
		);
		expect(localStorage.getItem('mapMode')).toBeNull();
		expect(localStorage.getItem('mapAisEnabled')).toBeNull();
		expect(sessionStorage.getItem('mapCamera')).toBeNull();
		expect(localStorage.getItem('gjemmekontor-theme')).toBe('dark');
	});
});
