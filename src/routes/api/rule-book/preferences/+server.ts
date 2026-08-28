import { handleRuleBookPreference } from '$lib/modules/rule-book/server';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	return handleRuleBookPreference(request, locals.db, requireTrip(locals).id);
};
