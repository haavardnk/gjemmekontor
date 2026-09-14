import type { CachedResourceDescriptor } from '$lib/client/cached-resource';
import { type MenuPageData, menuPageDataSchema } from '$lib/modules/menu/domain/menu';

export const menuCache: CachedResourceDescriptor<MenuPageData> = {
	moduleId: 'menu',
	snapshotKey: 'menu:snapshot:current',
	endpoint: '/api/menu',
	schema: menuPageDataSchema
};
