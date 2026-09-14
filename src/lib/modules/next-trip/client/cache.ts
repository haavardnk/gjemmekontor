import type { CachedResourceDescriptor } from '$lib/client/cached-resource';
import {
	type NextTripPageData,
	nextTripPageDataSchema
} from '$lib/modules/next-trip/domain/next-trip';

export const nextTripCache: CachedResourceDescriptor<NextTripPageData> = {
	moduleId: 'next-trip',
	snapshotKey: 'next-trip:snapshot:current',
	endpoint: '/api/next-trip',
	schema: nextTripPageDataSchema
};
