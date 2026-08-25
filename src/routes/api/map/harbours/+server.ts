import { handleHarbours } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => handleHarbours(url);
