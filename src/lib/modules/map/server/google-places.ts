import { z } from 'zod';

import { providerSearchTitle } from '$lib/modules/map/domain/enrichment';
import type { MapFeature } from '$lib/modules/map/domain/types';

import { parseProviderJson, ProviderError, providerResponseError } from './provider-http';

const searchResponseSchema = z.object({
	places: z
		.array(z.object({ id: z.string().min(10) }))
		.max(1)
		.optional()
});
const detailsResponseSchema = z.object({ id: z.string().min(10) });

export type GooglePlacesAdapter = {
	searchId: (feature: MapFeature) => Promise<string>;
	refreshId: (placeId: string) => Promise<string>;
};

export function createGooglePlacesAdapter(
	apiKey: string,
	fetchImplementation: typeof fetch = fetch
): GooglePlacesAdapter {
	async function searchId(feature: MapFeature): Promise<string> {
		if (feature.geometry.type !== 'Point') throw new ProviderError('no_match');
		let response: Response;
		try {
			response = await fetchImplementation('https://places.googleapis.com/v1/places:searchText', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'X-Goog-Api-Key': apiKey,
					'X-Goog-FieldMask': 'places.id'
				},
				body: JSON.stringify({
					textQuery: [providerSearchTitle(feature), feature.properties.address]
						.filter(Boolean)
						.join(', '),
					pageSize: 1,
					locationBias: {
						circle: {
							center: {
								latitude: feature.geometry.coordinates[1],
								longitude: feature.geometry.coordinates[0]
							},
							radius: 500
						}
					}
				}),
				signal: AbortSignal.timeout(8_000)
			});
		} catch {
			throw new ProviderError('unavailable');
		}
		if (!response.ok) throw providerResponseError(response);
		const body = await parseProviderJson(response, searchResponseSchema);
		const placeId = body.places?.[0]?.id;
		if (!placeId) throw new ProviderError('no_match');
		return placeId;
	}

	async function refreshId(placeId: string): Promise<string> {
		let response: Response;
		try {
			response = await fetchImplementation(
				`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=id`,
				{
					headers: { 'X-Goog-Api-Key': apiKey },
					signal: AbortSignal.timeout(8_000)
				}
			);
		} catch {
			throw new ProviderError('unavailable');
		}
		if (!response.ok) throw providerResponseError(response);
		return (await parseProviderJson(response, detailsResponseSchema)).id;
	}

	return { searchId, refreshId };
}
