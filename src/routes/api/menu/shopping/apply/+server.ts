import { getDatabase } from '$lib/app/server/database';
import { handleMenuShoppingApply } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) =>
	handleMenuShoppingApply(
		request,
		getDatabase(),
		undefined,
		undefined,
		locals.trip?.enabledModuleIds.includes('shopping-list') ?? false
	);
