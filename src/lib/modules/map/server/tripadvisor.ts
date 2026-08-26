import { z } from 'zod';

import {
	mapFeatureSymbol,
	providerSearchTitle,
	tripadvisorMediaUrlSchema,
	tripadvisorPageUrlSchema,
	type TripadvisorPhoto
} from '$lib/modules/map/domain/enrichment';
import type { MapFeature, MapSourceStyleLegend } from '$lib/modules/map/domain/types';

import { parseProviderJson, ProviderError, providerResponseError } from './provider-http';

const apiBaseUrl = 'https://terra.tripadvisor.com/api';

const translationSchema = z.object({
	value: z.string().min(1).max(500),
	primary: z.boolean().optional()
});
const catalogLocationSchema = z.object({
	id: z.coerce.string().regex(/^\d{1,20}$/),
	names: z.array(translationSchema).min(1).max(50),
	coordinates: z
		.object({
			latitude: z.coerce.number().min(-90).max(90),
			longitude: z.coerce.number().min(-180).max(180)
		})
		.optional(),
	overall_rating: z
		.object({
			rating: z.coerce.number().min(0).max(5).optional(),
			count: z.coerce.number().int().nonnegative().optional(),
			icon_url: tripadvisorMediaUrlSchema.optional()
		})
		.optional(),
	urls: z
		.object({
			tripadvisor: z
				.object({
					main: tripadvisorPageUrlSchema.optional(),
					photos: tripadvisorPageUrlSchema.optional()
				})
				.optional()
		})
		.optional()
});
const nearbyLocationSchema = z.object({
	location: catalogLocationSchema,
	distance_kilometers: z.coerce.number().nonnegative().optional()
});
const locationSearchSchema = z.object({ data: z.array(nearbyLocationSchema).max(20) });
const photoSchema = z.object({
	caption: z.string().max(5_000).optional(),
	photo: z.object({ original_size_url: tripadvisorMediaUrlSchema }),
	source: z.object({ name: z.string().max(200) }),
	user: z.object({ username: z.string().max(200).optional() }).optional()
});
const photosSchema = z.object({ data: z.array(photoSchema).max(5) });

export type TripadvisorDetails = {
	locationId: string;
	rating?: number;
	reviewCount?: number;
	ratingImageUrl?: string;
	webUrl?: string;
	photosUrl?: string;
};

export type TripadvisorAdapter = {
	searchId: (feature: MapFeature, sourceStyles: readonly MapSourceStyleLegend[]) => Promise<string>;
	details: (locationId: string) => Promise<TripadvisorDetails>;
	photos: (locationId: string, linkUrl?: string) => Promise<TripadvisorPhoto[]>;
};

function normalizedName(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function nameScore(expected: string, candidate: string): number {
	const left = normalizedName(expected);
	const right = normalizedName(candidate);
	if (left === right) return 1;
	if (left.includes(right) || right.includes(left)) return 0.8;
	const leftTokens = new Set(left.split(' ').filter(Boolean));
	const rightTokens = new Set(right.split(' ').filter(Boolean));
	const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
	const union = new Set([...leftTokens, ...rightTokens]).size;
	return union === 0 ? 0 : intersection / union;
}

function distanceMeters(feature: MapFeature, latitude?: number, longitude?: number): number {
	if (feature.geometry.type !== 'Point' || latitude === undefined || longitude === undefined) {
		return Number.POSITIVE_INFINITY;
	}
	const radians = Math.PI / 180;
	const [featureLongitude, featureLatitude] = feature.geometry.coordinates;
	const latitudeDelta = (latitude - featureLatitude) * radians;
	const longitudeDelta = (longitude - featureLongitude) * radians;
	const a =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(featureLatitude * radians) *
			Math.cos(latitude * radians) *
			Math.sin(longitudeDelta / 2) ** 2;
	return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function searchCategory(
	feature: MapFeature,
	sourceStyles: readonly MapSourceStyleLegend[]
): string | undefined {
	const symbol = mapFeatureSymbol(feature, sourceStyles);
	return symbol === 'restaurant' || symbol === 'bar' || symbol === 'cafe' || symbol === 'dessert'
		? 'RESTAURANT'
		: undefined;
}

export function createTripadvisorAdapter(
	apiKey: string,
	fetchImplementation: typeof fetch = fetch
): TripadvisorAdapter {
	const pendingDetails = new Map<string, TripadvisorDetails>();

	async function request<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
		const url = new URL(`${apiBaseUrl}${path}`);
		let response: Response;
		try {
			response = await fetchImplementation(url, {
				headers: { accept: 'application/json', 'x-api-key': apiKey },
				signal: AbortSignal.timeout(8_000)
			});
		} catch {
			throw new ProviderError('unavailable');
		}
		if (!response.ok) throw providerResponseError(response);
		return parseProviderJson(response, schema);
	}

	async function searchId(
		feature: MapFeature,
		sourceStyles: readonly MapSourceStyleLegend[]
	): Promise<string> {
		if (feature.geometry.type !== 'Point') throw new ProviderError('no_match');
		const parameters = new URLSearchParams({
			lat: String(feature.geometry.coordinates[1]),
			lon: String(feature.geometry.coordinates[0]),
			radius: '2',
			unit: 'KM',
			locale: 'en-US',
			size: '20',
			sort: 'distance,asc'
		});
		const category = searchCategory(feature, sourceStyles);
		if (category) parameters.set('category', category);
		const body = await request(`/catalog/locations/nearby?${parameters}`, locationSearchSchema);
		const expectedName = providerSearchTitle(feature);
		const ranked = body.data
			.map((candidate) => {
				const locationName =
					candidate.location.names.find((name) => name.primary)?.value ??
					candidate.location.names[0]?.value ??
					'';
				const name = nameScore(expectedName, locationName);
				const distance =
					candidate.location.coordinates !== undefined
						? distanceMeters(
								feature,
								candidate.location.coordinates.latitude,
								candidate.location.coordinates.longitude
							)
						: candidate.distance_kilometers !== undefined
							? candidate.distance_kilometers * 1000
							: Number.POSITIVE_INFINITY;
				const proximity =
					distance <= 250 ? 0.25 : distance <= 1000 ? 0.15 : distance <= 2000 ? 0.05 : 0;
				return {
					details: detailsFromCatalog(candidate.location),
					id: candidate.location.id,
					score: name * 0.75 + proximity
				};
			})
			.sort((left, right) => right.score - left.score);
		const first = ranked[0];
		const second = ranked[1];
		if (!first || first.score < 0.55 || (second && first.score - second.score < 0.08)) {
			throw new ProviderError('no_match');
		}
		pendingDetails.set(first.id, first.details);
		return first.id;
	}

	async function details(locationId: string): Promise<TripadvisorDetails> {
		const fromSearch = pendingDetails.get(locationId);
		if (fromSearch) {
			pendingDetails.delete(locationId);
			return fromSearch;
		}
		return detailsFromCatalog(
			await request(
				`/catalog/locations/${encodeURIComponent(locationId)}?locale=en-US`,
				catalogLocationSchema
			)
		);
	}

	async function photos(locationId: string, linkUrl?: string): Promise<TripadvisorPhoto[]> {
		const body = await request(
			`/locations/${encodeURIComponent(locationId)}/photos?locale=en-US&page=0&size=5`,
			photosSchema
		);
		return body.data.slice(0, 5).map((photo) => ({
			thumbnailUrl: photo.photo.original_size_url,
			imageUrl: photo.photo.original_size_url,
			...(linkUrl ? { linkUrl } : {}),
			...(photo.caption ? { caption: photo.caption.slice(0, 500) } : {}),
			...(photo.user?.username || photo.source.name
				? { contributor: photo.user?.username ?? photo.source.name }
				: {})
		}));
	}

	return { searchId, details, photos };
}

function detailsFromCatalog(location: z.infer<typeof catalogLocationSchema>): TripadvisorDetails {
	const rating = location.overall_rating;
	const urls = location.urls?.tripadvisor;
	return {
		locationId: location.id,
		...(rating?.rating !== undefined ? { rating: rating.rating } : {}),
		...(rating?.count !== undefined ? { reviewCount: rating.count } : {}),
		...(rating?.icon_url ? { ratingImageUrl: rating.icon_url } : {}),
		...(urls?.main ? { webUrl: urls.main } : {}),
		...(urls?.photos ? { photosUrl: urls.photos } : {})
	};
}
