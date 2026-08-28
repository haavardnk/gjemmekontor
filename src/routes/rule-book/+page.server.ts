import { listRuleBookMembers } from '$lib/modules/rule-book/server';
import { requireTrip } from '$lib/server/request';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	return { members: listRuleBookMembers(locals.db, requireTrip(locals).id) };
};
