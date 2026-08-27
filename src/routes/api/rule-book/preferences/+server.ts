import { getDatabase } from '$lib/app/server/database';
import { handleRuleBookPreference } from '$lib/modules/rule-book/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleRuleBookPreference(request, getDatabase(), locals.trip.id);
};
