import { handleOfflineMapFile } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request }) =>
	handleOfflineMapFile(params.mode, request);
