import { getDatabase } from '$lib/app/server/database';
import { handleArchiveGearCategory } from '$lib/modules/gear/server';

import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params }) =>
	handleArchiveGearCategory(getDatabase(), params.categoryId);
