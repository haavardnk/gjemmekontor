import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach((): void => {
	vi.useRealTimers();
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

	test('normalizes current opening hours and calculates open now in the place timezone', async (): Promise<void> => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
		const fetchFields = vi.fn(async () => ({}));
		class Place {
			utcOffsetMinutes = 120;
			currentOpeningHours = {
				periods: [
					{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
					{ open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 22, minute: 0 } },
					{ open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }
				]
			};
			regularOpeningHours = {
				periods: [{ open: { day: 3, hour: 8, minute: 0 }, close: { day: 3, hour: 20, minute: 0 } }]
			};
			fetchFields = fetchFields;
		}
		vi.stubGlobal('google', { maps: { importLibrary: vi.fn(async () => ({ Place })) } });
		const { fetchGooglePlacePresentation } = await import('./google-places-loader');

		const result = await fetchGooglePlacePresentation('ChIJ1234567890_test', 'browser-test-key');

		expect(result.openingHours).toEqual({
			isOpen: true,
			todayDayIndex: 3,
			todayHours: '10:00–22:00',
			weekdays: [
				{ dayIndex: 1, label: 'Mandag', hours: '09:00–17:00' },
				{ dayIndex: 2, label: 'Tirsdag', hours: 'Stengt' },
				{ dayIndex: 3, label: 'Onsdag', hours: '10:00–22:00' },
				{ dayIndex: 4, label: 'Torsdag', hours: 'Stengt' },
				{ dayIndex: 5, label: 'Fredag', hours: '18:00–02:00' },
				{ dayIndex: 6, label: 'Lørdag', hours: 'Stengt' },
				{ dayIndex: 0, label: 'Søndag', hours: 'Stengt' }
			]
		});
		expect(fetchFields).toHaveBeenCalledWith({
			fields: expect.arrayContaining([
				'currentOpeningHours',
				'regularOpeningHours',
				'utcOffsetMinutes'
			])
		});
		vi.setSystemTime(new Date('2026-08-28T23:30:00.000Z'));
		const overnight = await fetchGooglePlacePresentation('ChIJ1234567890_test', 'browser-test-key');
		expect(overnight.openingHours).toMatchObject({ isOpen: true, todayDayIndex: 6 });
	});

	test('reports closed now and supports Google always-open periods', async (): Promise<void> => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-26T22:30:00.000Z'));
		class ClosedPlace {
			utcOffsetMinutes = 120;
			regularOpeningHours = {
				periods: [{ open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 22, minute: 0 } }]
			};
			fetchFields = vi.fn(async () => ({}));
		}
		vi.stubGlobal('google', {
			maps: { importLibrary: vi.fn(async () => ({ Place: ClosedPlace })) }
		});
		let module = await import('./google-places-loader');
		expect(
			(await module.fetchGooglePlacePresentation('ChIJ1234567890_test', 'browser-test-key'))
				.openingHours?.isOpen
		).toBe(false);

		vi.resetModules();
		class AlwaysOpenPlace {
			utcOffsetMinutes = 120;
			currentOpeningHours = { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };
			fetchFields = vi.fn(async () => ({}));
		}
		vi.stubGlobal('google', {
			maps: { importLibrary: vi.fn(async () => ({ Place: AlwaysOpenPlace })) }
		});
		module = await import('./google-places-loader');
		const alwaysOpen = await module.fetchGooglePlacePresentation(
			'ChIJ1234567890_test',
			'browser-test-key'
		);
		expect(alwaysOpen.openingHours?.isOpen).toBe(true);
		expect(alwaysOpen.openingHours?.weekdays.every((day) => day.hours === 'Døgnåpent')).toBe(true);
	});
});
