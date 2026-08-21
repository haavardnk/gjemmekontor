import { handleGetHandleliste } from '$lib/server/bring';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => handleGetHandleliste();
