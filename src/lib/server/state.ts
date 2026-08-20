import type Database from 'better-sqlite3';
import { z } from 'zod';

import { apiError, apiSuccess } from './api';

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

function readRevision(db: Database.Database): number {
	const row = db.prepare("SELECT value FROM meta WHERE key = 'global_revision'").get() as {
		value: string;
	};
	const revision = Number.parseInt(row.value, 10);
	if (!Number.isSafeInteger(revision) || revision < 0) {
		throw new Error('INVALID_GLOBAL_REVISION');
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
	since: number
): { revision: number; entries: StateEntry[] } {
	const rows = db
		.prepare(
			`SELECT key, value, revision, client_id, mutation_id, updated_at
			 FROM state_entries WHERE revision > ? ORDER BY revision`
		)
		.all(since) as StateRow[];
	return { revision: readRevision(db), entries: rows.map(toStateEntry) };
}

export function syncState(
	db: Database.Database,
	mutations: StateMutation[],
	now: () => Date = (): Date => new Date()
): { revision: number; acknowledgedMutationIds: string[] } {
	return db.transaction(() => {
		let revision = readRevision(db);
		const acknowledgedMutationIds: string[] = [];
		const findReceipt = db.prepare('SELECT value FROM meta WHERE key = ?');
		const writeReceipt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
		const writeRevision = db.prepare("UPDATE meta SET value = ? WHERE key = 'global_revision'");
		const writeEntry = db.prepare(`
			INSERT INTO state_entries (key, value, revision, client_id, mutation_id, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET
				value = excluded.value,
				revision = excluded.revision,
				client_id = excluded.client_id,
				mutation_id = excluded.mutation_id,
				updated_at = excluded.updated_at
		`);

		for (const mutation of mutations) {
			const receiptKey = `mutation:${mutation.mutationId}`;
			if (findReceipt.get(receiptKey)) {
				acknowledgedMutationIds.push(mutation.mutationId);
				continue;
			}

			revision += 1;
			const updatedAt = now().toISOString();
			writeEntry.run(
				mutation.key,
				JSON.stringify(mutation.value),
				revision,
				mutation.clientId,
				mutation.mutationId,
				updatedAt
			);
			writeReceipt.run(receiptKey, String(revision));
			acknowledgedMutationIds.push(mutation.mutationId);
		}

		writeRevision.run(String(revision));
		return { revision, acknowledgedMutationIds };
	})();
}

export function handleGetState(request: Request, db: Database.Database): Response {
	const rawSince = new URL(request.url).searchParams.get('since') ?? '0';
	const since = Number(rawSince);
	if (!Number.isSafeInteger(since) || since < 0) {
		return apiError('INVALID_REVISION', 400);
	}

	return apiSuccess(getState(db, since));
}

export async function handleSyncState(request: Request, db: Database.Database): Promise<Response> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return apiError('INVALID_REQUEST', 400);
	}

	const result = syncSchema.safeParse(body);
	if (!result.success) {
		return apiError('INVALID_MUTATIONS', 400);
	}

	return apiSuccess(syncState(db, result.data.mutations));
}
