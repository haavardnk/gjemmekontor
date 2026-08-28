import { handleOrderGearCategories, handleSaveGearCategory } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) =>
	handleSaveGearCategory(request, locals.db);
export const PATCH: RequestHandler = ({ request, locals }) =>
	handleOrderGearCategories(request, locals.db);
