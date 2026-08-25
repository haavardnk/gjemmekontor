import { handleMarineProfileTile } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) =>
	handleMarineProfileTile(params.z, params.x, params.y);
