import { handleHarbours } from '$lib/server/map/harbours';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => handleHarbours(url);
