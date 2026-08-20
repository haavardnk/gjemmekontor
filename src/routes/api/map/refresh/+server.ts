import { handleRefreshMap } from '$lib/server/map/service';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => handleRefreshMap();
