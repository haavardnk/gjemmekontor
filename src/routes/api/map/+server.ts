import { handleGetMap } from '$lib/server/map/service';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => handleGetMap();
