import { getDatabase } from '$lib/app/server/database';
import { handleOrderGearCategories, handleSaveGearCategory } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleSaveGearCategory(request, getDatabase());
export const PATCH: RequestHandler = ({ request }) =>
	handleOrderGearCategories(request, getDatabase());
