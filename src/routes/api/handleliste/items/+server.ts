import {
	handleAddHandlelisteItem,
	handleCompleteHandlelisteItem,
	handleEditHandlelisteItem
} from '$lib/server/bring';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleAddHandlelisteItem(request);
export const PATCH: RequestHandler = ({ request }) => handleCompleteHandlelisteItem(request);
export const PUT: RequestHandler = ({ request }) => handleEditHandlelisteItem(request);
