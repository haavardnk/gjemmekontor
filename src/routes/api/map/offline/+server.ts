import { handleOfflineMapManifest } from '$lib/server/map/offline';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => handleOfflineMapManifest();
