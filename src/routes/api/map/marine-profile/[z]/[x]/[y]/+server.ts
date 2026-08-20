import { handleMarineProfileTile } from '$lib/server/map/depth-contours';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) =>
	handleMarineProfileTile(params.z, params.x, params.y);
