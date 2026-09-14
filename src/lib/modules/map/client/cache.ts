import type { CachedResourceDescriptor } from '$lib/client/cached-resource';
import { mapSnapshotKey } from '$lib/modules/map/client/offline';
import { type MapSnapshot, mapSnapshotSchema } from '$lib/modules/map/domain/types';

export const mapCache: CachedResourceDescriptor<MapSnapshot> = {
	moduleId: 'map',
	snapshotKey: mapSnapshotKey,
	endpoint: '/api/map',
	select: (response) =>
		response && typeof response === 'object' && 'snapshot' in response
			? response.snapshot
			: undefined,
	schema: mapSnapshotSchema
};
