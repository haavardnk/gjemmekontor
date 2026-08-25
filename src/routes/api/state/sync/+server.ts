import { getDatabase } from '$lib/app/server/database';
import { handleSyncState } from '$lib/server/state';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleSyncState(request, getDatabase());
