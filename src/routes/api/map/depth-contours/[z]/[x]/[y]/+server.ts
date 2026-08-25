import { handleDepthContourTile } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) =>
	handleDepthContourTile(params.z, params.x, params.y);
