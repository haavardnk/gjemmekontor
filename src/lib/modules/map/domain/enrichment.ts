import { z } from 'zod';

import {
	type MapFeature,
	mapPointCategory,
	type MapPointSymbol,
	type MapSourceStyleLegend
} from './types';

export const googlePlaceIdField = 'google_place_id';
export const tripadvisorLocationIdField = 'tripadvisor_location_id';
export const enrichmentTechnicalFields = new Set([googlePlaceIdField, tripadvisorLocationIdField]);

export function mapFeatureSymbol(
	feature: MapFeature,
	sourceStyles: readonly MapSourceStyleLegend[] = []
): MapPointSymbol | undefined {
	if (feature.geometry.type !== 'Point') return undefined;
	const sourceStyle = sourceStyles.find((style) => style.key === feature.properties.sourceStyleKey);
	return sourceStyle?.symbol ?? mapPointCategory(feature.properties.style.iconCode ?? '').symbol;
}

export function isPoiEnrichmentEligible(feature: MapFeature): boolean {
	return feature.geometry.type === 'Point';
}

export function providerSearchTitle(feature: MapFeature): string {
	const symbol = mapFeatureSymbol(feature);
	if (symbol !== 'anchorage' && symbol !== 'buoy-field' && symbol !== 'marina') {
		return feature.properties.title;
	}
	return feature.properties.title.replace(/^\s*\d+(?:\s*[.)-]\s*|\s+)/, '').trim();
}

function extendedDataValue(feature: MapFeature, expectedName: string): string | undefined {
	const entry = Object.entries(feature.properties.extendedData).find(
		([name]) => name.trim().toLocaleLowerCase() === expectedName
	);
	return entry?.[1].trim() || undefined;
}

export function googlePlaceIdOverride(feature: MapFeature): string | undefined {
	const value = extendedDataValue(feature, googlePlaceIdField);
	return value && /^[A-Za-z0-9_-]{10,512}$/.test(value) ? value : undefined;
}

export function tripadvisorLocationIdOverride(feature: MapFeature): string | undefined {
	const value = extendedDataValue(feature, tripadvisorLocationIdField);
	return value && /^\d{1,20}$/.test(value) ? value : undefined;
}

export const providerStatusSchema = z.enum(['available', 'disabled', 'no_match', 'unavailable']);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

function providerUrl(domains: readonly string[]): z.ZodType<string> {
	return z
		.url()
		.startsWith('https://')
		.refine((value) => {
			const hostname = new URL(value).hostname.toLocaleLowerCase();
			return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
		});
}

export const tripadvisorPageUrlSchema = providerUrl(['tripadvisor.com']);
export const tripadvisorMediaUrlSchema = providerUrl(['tripadvisor.com', 'tacdn.com']);

export const googleEnrichmentSchema = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('available'),
		placeId: z.string().min(10),
		uiKitKey: z.string().min(1)
	}),
	z.object({ status: z.literal('disabled') }),
	z.object({ status: z.literal('no_match') }),
	z.object({ status: z.literal('unavailable') })
]);
export type GoogleEnrichment = z.infer<typeof googleEnrichmentSchema>;

export const tripadvisorPhotoSchema = z.object({
	thumbnailUrl: tripadvisorMediaUrlSchema,
	imageUrl: tripadvisorMediaUrlSchema,
	linkUrl: tripadvisorPageUrlSchema.optional(),
	caption: z.string().max(500).optional(),
	contributor: z.string().max(200).optional()
});
export type TripadvisorPhoto = z.infer<typeof tripadvisorPhotoSchema>;

const tripadvisorAvailableSchema = z.object({
	status: z.literal('available'),
	locationId: z.string().regex(/^\d{1,20}$/),
	rating: z.number().min(0).max(5).optional(),
	reviewCount: z.number().int().nonnegative().optional(),
	ratingImageUrl: tripadvisorMediaUrlSchema.optional(),
	webUrl: tripadvisorPageUrlSchema.optional(),
	photosUrl: tripadvisorPageUrlSchema.optional(),
	photos: z.array(tripadvisorPhotoSchema).max(5),
	photosLoaded: z.boolean(),
	cachedAt: z.iso.datetime(),
	expiresAt: z.iso.datetime()
});

export const tripadvisorEnrichmentSchema = z.discriminatedUnion('status', [
	tripadvisorAvailableSchema,
	z.object({ status: z.literal('disabled') }),
	z.object({ status: z.literal('no_match') }),
	z.object({ status: z.literal('unavailable') })
]);
export type TripadvisorEnrichment = z.infer<typeof tripadvisorEnrichmentSchema>;
export type TripadvisorAvailableEnrichment = z.infer<typeof tripadvisorAvailableSchema>;

export const poiEnrichmentResponseSchema = z.object({
	featureId: z.string().min(1).max(128),
	google: googleEnrichmentSchema,
	tripadvisor: tripadvisorEnrichmentSchema
});
export type PoiEnrichmentResponse = z.infer<typeof poiEnrichmentResponseSchema>;

export const tripadvisorPhotosResponseSchema = z.object({
	featureId: z.string().min(1).max(128),
	tripadvisor: tripadvisorEnrichmentSchema
});
export type TripadvisorPhotosResponse = z.infer<typeof tripadvisorPhotosResponseSchema>;
