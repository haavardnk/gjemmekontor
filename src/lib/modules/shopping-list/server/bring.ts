import type Database from 'better-sqlite3';

import {
	addShoppingListItemSchema,
	completeShoppingListItemSchema,
	editShoppingListItemSchema
} from '$lib/modules/shopping-list/domain/shopping-list';
import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import { BringService, BringServiceError } from './bring-service';
import { type BringConfig, type BringCredentials, getBringCredentials } from './config';

export {
	type BringClient,
	BringConnectionService,
	type BringErrorCode,
	type BringListConnection,
	BringService,
	BringServiceError
} from './bring-service';

function errorResponse(error: unknown): Response {
	if (!(error instanceof BringServiceError)) return apiError('BRING_UNAVAILABLE', 502);
	return apiError(error.code, error.code === 'BRING_NOT_CONFIGURED' ? 503 : 502);
}

export function loadTripBringConfig(
	db: Database.Database,
	tripId: string,
	credentials: BringCredentials | undefined = getBringCredentials()
): BringConfig | undefined {
	if (!credentials) return undefined;
	const row = db
		.prepare(
			`SELECT config_json FROM trip_modules
			 WHERE trip_id = ? AND module_id = 'shopping-list' AND enabled = 1`
		)
		.get(tripId) as { config_json: string } | undefined;
	if (!row) return undefined;
	const config = JSON.parse(row.config_json) as Record<string, unknown>;
	return typeof config.listUuid === 'string' && config.providerStatus === 'verified'
		? { ...credentials, listUuid: config.listUuid }
		: undefined;
}

const services = new Map<string, { listUuid: string; service: BringService }>();

export function getBringService(db: Database.Database, tripId: string): BringService {
	const config = loadTripBringConfig(db, tripId);
	const cached = services.get(tripId);
	if (cached && cached.listUuid === config?.listUuid) return cached.service;
	const service = new BringService(config);
	if (config) services.set(tripId, { listUuid: config.listUuid, service });
	else services.delete(tripId);
	return service;
}

async function handleBring(operation: () => Promise<unknown>): Promise<Response> {
	try {
		return apiSuccess(await operation());
	} catch (error) {
		return errorResponse(error);
	}
}

export function handleGetShoppingList(bring: BringService): Promise<Response> {
	return handleBring(() => bring.snapshot());
}

export async function handleAddShoppingListItem(
	request: Request,
	bring: BringService
): Promise<Response> {
	const result = await parseJsonRequest(request, addShoppingListItemSchema);
	return result.success
		? handleBring(() => bring.add(result.data.name, result.data.specification))
		: apiError('INVALID_REQUEST', 400);
}

export async function handleCompleteShoppingListItem(
	request: Request,
	bring: BringService
): Promise<Response> {
	const result = await parseJsonRequest(request, completeShoppingListItemSchema);
	return result.success
		? handleBring(() => bring.complete(result.data.sourceName))
		: apiError('INVALID_REQUEST', 400);
}

export async function handleEditShoppingListItem(
	request: Request,
	bring: BringService
): Promise<Response> {
	const result = await parseJsonRequest(request, editShoppingListItemSchema);
	return result.success
		? handleBring(() => bring.edit(result.data.sourceName, result.data.specification))
		: apiError('INVALID_REQUEST', 400);
}
