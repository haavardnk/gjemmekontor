import { handleGetPoiEnrichmentPhotos } from '$lib/modules/map/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => handleGetPoiEnrichmentPhotos(params.featureId);
