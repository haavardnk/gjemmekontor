import { getDatabase } from '$lib/app/server/database';
import { listRuleBookMembers } from '$lib/modules/rule-book/server';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return { members: listRuleBookMembers(getDatabase(), locals.trip.id) };
};
