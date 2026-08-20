import { handleDepthContourTile } from '$lib/server/map/depth-contours';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) =>
	handleDepthContourTile(params.z, params.x, params.y);
