import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach((): void => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe('Google Places UI Kit loader', (): void => {
	test('waits for the async Google callback before importing Places', async (): Promise<void> => {
		let appendedScript: { src: string; nonce?: string; async?: boolean } | undefined;
		const documentStub = {
			createElement: vi.fn(() => ({ src: '' })),
			querySelector: vi.fn(() => undefined),
			head: {
				append: vi.fn((script: { src: string }): void => {
					appendedScript = script;
				})
			}
		};
		vi.stubGlobal('document', documentStub);
		vi.stubGlobal('google', undefined);
		const { loadGooglePlacesUiKit } = await import('./google-places-loader');

		let resolved = false;
		const loading = loadGooglePlacesUiKit('browser-test-key').then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);
		expect(appendedScript).toBeDefined();
		const callback = new URL(appendedScript?.src ?? '').searchParams.get('callback');
		expect(callback).toBe('__gjemmekontorGooglePlacesReady');

		const importLibrary = vi.fn(async () => ({}));
		vi.stubGlobal('google', { maps: { importLibrary } });
		const ready = (globalThis as typeof globalThis & Record<string, unknown>)[callback ?? ''];
		if (typeof ready !== 'function') throw new Error('GOOGLE_CALLBACK_MISSING');
		ready();
		await loading;

		expect(resolved).toBe(true);
		expect(importLibrary).toHaveBeenCalledWith('places');
	});

	test('normalizes ratings, links, and ten fresh photos for the custom card', async (): Promise<void> => {
		const getURI = vi.fn(() => 'https://lh3.googleusercontent.com/photo.jpg');
		class Place {
			rating = 4.5;
			userRatingCount = 238;
			googleMapsURI = 'https://www.google.com/maps/place/test';
			attributions = ['Partner data'];
			photos = Array.from({ length: 12 }, () => ({
				getURI,
				authorAttributions: [{ displayName: 'Traveler' }]
			}));
			fetchFields = vi.fn(async () => ({}));
		}
		const importLibrary = vi.fn(async () => ({ Place }));
		vi.stubGlobal('google', { maps: { importLibrary } });
		const { fetchGooglePlacePresentation } = await import('./google-places-loader');

		const result = await fetchGooglePlacePresentation('ChIJ1234567890_test', 'browser-test-key');

		expect(result).toMatchObject({
			rating: 4.5,
			reviewCount: 238,
			webUrl: 'https://www.google.com/maps/place/test',
			attributions: ['Partner data']
		});
		expect(result.photos).toHaveLength(10);
		expect(result.photos[0]).toMatchObject({ contributor: 'Traveler' });
		expect(getURI).toHaveBeenCalledTimes(10);
	});
});
