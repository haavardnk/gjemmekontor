let loader: Promise<void> | undefined;
let loadedKey: string | undefined;

type GoogleMapsGlobal = typeof globalThis & {
	google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
};

type GoogleAuthorAttribution = { displayName: string };
type GooglePhoto = {
	authorAttributions?: GoogleAuthorAttribution[];
	getURI: (options: { maxHeight: number; maxWidth: number }) => string;
};
type GooglePlaceInstance = {
	attributions?: string[];
	googleMapsURI?: string;
	photos?: GooglePhoto[];
	rating?: number;
	userRatingCount?: number;
	fetchFields: (request: { fields: string[] }) => Promise<unknown>;
};
type GooglePlacesLibrary = {
	Place: new (options: { id: string }) => GooglePlaceInstance;
};

export type GooglePlacePresentation = {
	rating?: number;
	reviewCount?: number;
	webUrl?: string;
	attributions: string[];
	photos: Array<{
		thumbnailUrl: string;
		imageUrl: string;
		contributor?: string;
	}>;
};

const readyCallbackName = '__gjemmekontorGooglePlacesReady';

export function loadGooglePlacesUiKit(apiKey: string): Promise<void> {
	if (loader) {
		return loadedKey === apiKey ? loader : Promise.reject(new Error('GOOGLE_KEY_CHANGED'));
	}
	loadedKey = apiKey;
	loader = new Promise<void>((resolve, reject) => {
		const global = globalThis as GoogleMapsGlobal;
		if (global.google?.maps?.importLibrary) {
			void global.google.maps.importLibrary('places').then(() => resolve(), reject);
			return;
		}
		const ready = (): void => {
			const importLibrary = (globalThis as GoogleMapsGlobal).google?.maps?.importLibrary;
			if (!importLibrary) {
				reject(new Error('GOOGLE_PLACES_UNAVAILABLE'));
				return;
			}
			void importLibrary('places').then(() => resolve(), reject);
		};
		const parameters = new URLSearchParams({
			key: apiKey,
			loading: 'async',
			libraries: 'places',
			v: 'weekly',
			auth_referrer_policy: 'origin',
			callback: readyCallbackName
		});
		const script = document.createElement('script');
		const callbackGlobal = globalThis as typeof globalThis & Record<string, unknown>;
		const cleanup = (): void => {
			delete callbackGlobal[readyCallbackName];
		};
		callbackGlobal[readyCallbackName] = (): void => {
			cleanup();
			ready();
		};
		script.async = true;
		const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
		if (nonce) script.nonce = nonce;
		script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
		script.onerror = (): void => {
			cleanup();
			reject(new Error('GOOGLE_PLACES_UNAVAILABLE'));
		};
		document.head.append(script);
	});
	return loader;
}

export async function fetchGooglePlacePresentation(
	placeId: string,
	apiKey: string
): Promise<GooglePlacePresentation> {
	await loadGooglePlacesUiKit(apiKey);
	const importLibrary = (globalThis as GoogleMapsGlobal).google?.maps?.importLibrary;
	if (!importLibrary) throw new Error('GOOGLE_PLACES_UNAVAILABLE');
	const { Place } = (await importLibrary('places')) as GooglePlacesLibrary;
	const place = new Place({ id: placeId });
	await place.fetchFields({ fields: ['googleMapsURI', 'photos', 'rating', 'userRatingCount'] });
	return {
		...(place.rating !== undefined ? { rating: place.rating } : {}),
		...(place.userRatingCount !== undefined ? { reviewCount: place.userRatingCount } : {}),
		...(place.googleMapsURI ? { webUrl: place.googleMapsURI } : {}),
		attributions: place.attributions ?? [],
		photos: (place.photos ?? []).slice(0, 10).map((photo) => {
			const imageUrl = photo.getURI({ maxHeight: 900, maxWidth: 1200 });
			const contributor = photo.authorAttributions?.[0]?.displayName;
			return {
				thumbnailUrl: imageUrl,
				imageUrl,
				...(contributor ? { contributor } : {})
			};
		})
	};
}
