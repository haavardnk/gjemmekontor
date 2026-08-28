import { handleArchiveGearCategory } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params, locals }) =>
	handleArchiveGearCategory(locals.db, params.categoryId);
