import { getDatabase } from '$lib/app/server/database';
import { handleMenuShoppingPreview } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) =>
	handleMenuShoppingPreview(
		request,
		getDatabase(),
		undefined,
		locals.trip?.enabledModuleIds.includes('shopping-list') ?? false
	);
