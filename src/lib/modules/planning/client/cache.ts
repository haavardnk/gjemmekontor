import type { CachedResourceDescriptor } from '$lib/client/cached-resource';
import {
	type PlanningPageData,
	planningPageDataSchema
} from '$lib/modules/planning/domain/planning';

export const planningCache: CachedResourceDescriptor<PlanningPageData> = {
	moduleId: 'planning',
	snapshotKey: 'planning:snapshot:v1',
	endpoint: '/api/planning',
	schema: planningPageDataSchema
};
