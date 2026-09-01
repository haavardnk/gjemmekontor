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
type GoogleOpeningHoursPoint = { day: number; hour: number; minute: number };
type GoogleOpeningHoursPeriod = {
	open: GoogleOpeningHoursPoint;
	close?: GoogleOpeningHoursPoint;
};
type GoogleOpeningHours = {
	periods: GoogleOpeningHoursPeriod[];
};
type GooglePriceLevel = 'FREE' | 'INEXPENSIVE' | 'MODERATE' | 'EXPENSIVE' | 'VERY_EXPENSIVE';
type GooglePlaceInstance = {
	attributions?: string[];
	currentOpeningHours?: GoogleOpeningHours;
	googleMapsURI?: string;
	photos?: GooglePhoto[];
	priceLevel?: GooglePriceLevel;
	primaryTypeDisplayName?: string;
	rating?: number;
	regularOpeningHours?: GoogleOpeningHours;
	utcOffsetMinutes?: number;
	userRatingCount?: number;
	fetchFields: (request: { fields: string[] }) => Promise<unknown>;
};
type GooglePlacesLibrary = {
	Place: new (options: { id: string }) => GooglePlaceInstance;
};

export type GoogleOpeningHoursPresentation = {
	isOpen?: boolean;
	todayDayIndex: number;
	todayHours: string;
	weekdays: Array<{ dayIndex: number; label: string; hours: string }>;
};

export type GooglePlacePresentation = {
	category?: string;
	priceLevel?: string;
	rating?: number;
	reviewCount?: number;
	webUrl?: string;
	attributions: string[];
	openingHours?: GoogleOpeningHoursPresentation;
	photos: Array<{
		thumbnailUrl: string;
		imageUrl: string;
		contributor?: string;
	}>;
};

const weekdayLabels = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const minutesPerDay = 24 * 60;
const minutesPerWeek = 7 * minutesPerDay;
const priceLevelLabels: Record<GooglePriceLevel, string> = {
	FREE: 'Gratis',
	INEXPENSIVE: '$',
	MODERATE: '$$',
	EXPENSIVE: '$$$',
	VERY_EXPENSIVE: '$$$$'
};

function pointMinutes(point: GoogleOpeningHoursPoint): number {
	return point.day * minutesPerDay + point.hour * 60 + point.minute;
}

function pointTime(point: GoogleOpeningHoursPoint): string {
	return `${String(point.hour).padStart(2, '0')}:${String(point.minute).padStart(2, '0')}`;
}

function dayHours(periods: GoogleOpeningHoursPeriod[], dayIndex: number): string {
	if (periods.some((period) => period.close === undefined)) return 'Døgnåpent';
	const intervals = periods
		.filter((period) => period.open.day === dayIndex && period.close)
		.map((period) => `${pointTime(period.open)}–${pointTime(period.close!)}`);
	return intervals.length > 0 ? intervals.join(', ') : 'Stengt';
}

function openAt(
	periods: GoogleOpeningHoursPeriod[],
	dayIndex: number,
	minuteOfDay: number
): boolean {
	if (periods.some((period) => period.close === undefined)) return true;
	const current = dayIndex * minutesPerDay + minuteOfDay;
	return periods.some((period) => {
		if (!period.close) return true;
		const start = pointMinutes(period.open);
		let end = pointMinutes(period.close);
		if (end <= start) end += minutesPerWeek;
		return (
			(current >= start && current < end) ||
			(current + minutesPerWeek >= start && current + minutesPerWeek < end)
		);
	});
}

function openingHoursPresentation(
	place: GooglePlaceInstance,
	now = new Date()
): GoogleOpeningHoursPresentation | undefined {
	const openingHours = place.currentOpeningHours ?? place.regularOpeningHours;
	if (!openingHours) return undefined;
	const offset = place.utcOffsetMinutes;
	const placeTime = offset === undefined ? now : new Date(now.getTime() + offset * 60 * 1000);
	const todayDayIndex = offset === undefined ? placeTime.getDay() : placeTime.getUTCDay();
	const hour = offset === undefined ? placeTime.getHours() : placeTime.getUTCHours();
	const minute = offset === undefined ? placeTime.getMinutes() : placeTime.getUTCMinutes();
	return {
		isOpen: openAt(openingHours.periods, todayDayIndex, hour * 60 + minute),
		todayDayIndex,
		todayHours: dayHours(openingHours.periods, todayDayIndex),
		weekdays: weekdayOrder.map((dayIndex) => ({
			dayIndex,
			label: weekdayLabels[dayIndex] ?? '',
			hours: dayHours(openingHours.periods, dayIndex)
		}))
	};
}

const readyCallbackName = '__gjemmekontorGooglePlacesReady';

export function loadGooglePlacesLibrary(apiKey: string): Promise<void> {
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
	await loadGooglePlacesLibrary(apiKey);
	const importLibrary = (globalThis as GoogleMapsGlobal).google?.maps?.importLibrary;
	if (!importLibrary) throw new Error('GOOGLE_PLACES_UNAVAILABLE');
	const { Place } = (await importLibrary('places')) as GooglePlacesLibrary;
	const place = new Place({ id: placeId });
	await place.fetchFields({
		fields: [
			'currentOpeningHours',
			'googleMapsURI',
			'photos',
			'priceLevel',
			'primaryTypeDisplayName',
			'rating',
			'regularOpeningHours',
			'userRatingCount',
			'utcOffsetMinutes'
		]
	});
	const openingHours = openingHoursPresentation(place);
	return {
		...(place.primaryTypeDisplayName ? { category: place.primaryTypeDisplayName } : {}),
		...(place.priceLevel ? { priceLevel: priceLevelLabels[place.priceLevel] } : {}),
		...(place.rating !== undefined ? { rating: place.rating } : {}),
		...(place.userRatingCount !== undefined ? { reviewCount: place.userRatingCount } : {}),
		...(place.googleMapsURI ? { webUrl: place.googleMapsURI } : {}),
		attributions: place.attributions ?? [],
		...(openingHours ? { openingHours } : {}),
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
