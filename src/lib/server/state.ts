import type Database from 'better-sqlite3';
import { z } from 'zod';

import { moduleForStateKey } from '$lib/app/modules/catalog';

import { apiError, apiSuccess, readJsonRequest } from './api';

const mutationSchema = z
	.object({
		mutationId: z.string().min(1).max(128),
		clientId: z.string().min(1).max(128),
		key: z.string().min(1).max(512),
		value: z.json(),
		clientTimestamp: z.number().int().nonnegative()
	})
	.strict();

const syncSchema = z.object({ mutations: z.array(mutationSchema).max(500) }).strict();

export type StateMutation = z.infer<typeof mutationSchema>;

export type StateEntry = {
	key: string;
	value: z.infer<typeof z.json>;
	revision: number;
	clientId: string;
	mutationId: string;
	updatedAt: string;
};

type StateRow = {
	key: string;
	value: string;
	revision: number;
	client_id: string;
	mutation_id: string;
	updated_at: string;
};

function readRevision(db: Database.Database, tripId: string): number {
	const row = db.prepare('SELECT revision FROM trip_revisions WHERE trip_id = ?').get(tripId) as
		{ revision: number } | undefined;
	if (!row) {
		throw new Error('TRIP_REVISION_NOT_FOUND');
	}
	const revision = row.revision;
	if (!Number.isSafeInteger(revision) || revision < 0) {
		throw new Error('INVALID_TRIP_REVISION');
	}
	return revision;
}

function toStateEntry(row: StateRow): StateEntry {
	return {
		key: row.key,
		value: JSON.parse(row.value) as z.infer<typeof z.json>,
		revision: row.revision,
		clientId: row.client_id,
		mutationId: row.mutation_id,
		updatedAt: row.updated_at
	};
}

export function getState(
	db: Database.Database,
	tripId: string,
	since: number
): { revision: number; entries: StateEntry[] } {
	const rows = db
		.prepare(
			`SELECT key, value, revision, client_id, mutation_id, updated_at
			 FROM trip_state_entries
			 WHERE trip_id = ? AND revision > ?
			 ORDER BY revision`
		)
		.all(tripId, since) as StateRow[];
	return { revision: readRevision(db, tripId), entries: rows.map(toStateEntry) };
}

export function syncState(
	db: Database.Database,
	tripId: string,
	mutations: StateMutation[],
	now: () => Date = (): Date => new Date()
): { revision: number; acknowledgedMutationIds: string[] } {
	return db.transaction(() => {
		let revision = readRevision(db, tripId);
		const acknowledgedMutationIds: string[] = [];
		const findReceipt = db.prepare(
			'SELECT revision FROM trip_mutation_receipts WHERE trip_id = ? AND mutation_id = ?'
		);
		const writeReceipt = db.prepare(
			'INSERT INTO trip_mutation_receipts (trip_id, mutation_id, revision) VALUES (?, ?, ?)'
		);
		const writeRevision = db.prepare('UPDATE trip_revisions SET revision = ? WHERE trip_id = ?');
		const writeEntry = db.prepare(`
			INSERT INTO trip_state_entries
				(trip_id, key, value, revision, client_id, mutation_id, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(trip_id, key) DO UPDATE SET
				value = excluded.value,
				revision = excluded.revision,
				client_id = excluded.client_id,
				mutation_id = excluded.mutation_id,
				updated_at = excluded.updated_at
		`);

		for (const mutation of mutations) {
			if (findReceipt.get(tripId, mutation.mutationId)) {
				acknowledgedMutationIds.push(mutation.mutationId);
				continue;
			}

			revision += 1;
			const updatedAt = now().toISOString();
			writeEntry.run(
				tripId,
				mutation.key,
				JSON.stringify(mutation.value),
				revision,
				mutation.clientId,
				mutation.mutationId,
				updatedAt
			);
			writeReceipt.run(tripId, mutation.mutationId, revision);
			acknowledgedMutationIds.push(mutation.mutationId);
		}

		writeRevision.run(revision, tripId);
		return { revision, acknowledgedMutationIds };
	})();
}

export function handleGetState(request: Request, db: Database.Database, tripId: string): Response {
	const rawSince = new URL(request.url).searchParams.get('since') ?? '0';
	const since = Number(rawSince);
	if (!Number.isSafeInteger(since) || since < 0) {
		return apiError('INVALID_REVISION', 400);
	}

	return apiSuccess(getState(db, tripId, since));
}

export async function handleSyncState(
	request: Request,
	db: Database.Database,
	tripId: string,
	enabledModuleIds: readonly string[]
): Promise<Response> {
	const body = await readJsonRequest(request);
	if (body === undefined) return apiError('INVALID_REQUEST', 400);

	const result = syncSchema.safeParse(body);
	if (!result.success) {
		return apiError('INVALID_MUTATIONS', 400);
	}
	for (const mutation of result.data.mutations) {
		const module = moduleForStateKey(mutation.key);
		if (!module) return apiError('INVALID_STATE_KEY', 400);
		if (!enabledModuleIds.includes(module.id)) return apiError('MODULE_DISABLED', 404);
	}

	return apiSuccess(syncState(db, tripId, result.data.mutations));
}
