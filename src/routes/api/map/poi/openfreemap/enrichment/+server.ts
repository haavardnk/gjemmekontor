import { handleOpenFreeMapPoiEnrichment } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleOpenFreeMapPoiEnrichment(request);
