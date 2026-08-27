import { getDatabase } from '$lib/app/server/database';
import { handleResetRuleBookGame, handleStartRuleBookGame } from '$lib/modules/rule-book/server';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return handleStartRuleBookGame(request, getDatabase(), locals.trip.id);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	let clientId = '';
	try {
		const body = (await request.json()) as { clientId?: unknown };
		if (typeof body.clientId === 'string') clientId = body.clientId;
	} catch {
		return new Response(JSON.stringify({ error: 'INVALID_REQUEST' }), { status: 400 });
	}
	if (!clientId || clientId.length > 128) {
		return new Response(JSON.stringify({ error: 'INVALID_REQUEST' }), { status: 400 });
	}
	return handleResetRuleBookGame(getDatabase(), locals.trip.id, clientId);
};
