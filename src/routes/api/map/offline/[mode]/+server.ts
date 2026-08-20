import { handleOfflineMapFile } from '$lib/server/map/offline';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request }) =>
	handleOfflineMapFile(params.mode, request);
