import { handleFlightLookup } from '$lib/modules/itinerary/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleFlightLookup(request);
