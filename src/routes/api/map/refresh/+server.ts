import { handleRefreshMap } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => handleRefreshMap();
