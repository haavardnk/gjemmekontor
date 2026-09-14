import type { CachedResourceDescriptor } from '$lib/client/cached-resource';
import { type GearPageData, gearPageDataSchema } from '$lib/modules/gear/domain/gear';

export const gearCache: CachedResourceDescriptor<GearPageData> = {
	moduleId: 'gear',
	snapshotKey: 'gear:snapshot:current',
	endpoint: '/api/gear',
	schema: gearPageDataSchema
};
