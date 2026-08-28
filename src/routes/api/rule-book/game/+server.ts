import { handleResetRuleBookGame, handleStartRuleBookGame } from '$lib/modules/rule-book/server';
import { apiError, readJsonRequest } from '$lib/server/api';
import { requireTrip } from '$lib/server/request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	return handleStartRuleBookGame(request, locals.db, requireTrip(locals).id);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const trip = requireTrip(locals);
	const body = await readJsonRequest(request);
	const clientId =
		body && typeof body === 'object' && 'clientId' in body && typeof body.clientId === 'string'
			? body.clientId
			: '';
	if (!clientId || clientId.length > 128) {
		return apiError('INVALID_REQUEST', 400);
	}
	return handleResetRuleBookGame(locals.db, trip.id, clientId);
};
