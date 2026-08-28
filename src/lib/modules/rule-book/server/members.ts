import type Database from 'better-sqlite3';
import { z } from 'zod';

import {
	activeRuleBookGameSchema,
	ruleBookGameKey,
	type RuleBookMember,
	serializeRuleBookGame,
	shuffledParticipants
} from '$lib/modules/rule-book/domain/rule-book';
import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';
import { syncState } from '$lib/server/state';

type MemberRow = {
	id: string;
	name: string;
	opted_out: number;
};

const preferenceSchema = z.object({ personId: z.uuid(), optedOut: z.boolean() }).strict();
const startSchema = z.object({ clientId: z.string().min(1).max(128) }).strict();

export function listRuleBookMembers(db: Database.Database, tripId: string): RuleBookMember[] {
	const rows = db
		.prepare(
			`SELECT p.id, COALESCE(m.trip_label, p.display_name) AS name,
			        COALESCE(pref.opted_out, 0) AS opted_out
			 FROM trip_members m
			 JOIN people p ON p.id = m.person_id
			 LEFT JOIN trip_member_module_preferences pref
			   ON pref.trip_id = m.trip_id
			  AND pref.person_id = m.person_id
			  AND pref.module_id = 'rule-book'
			 WHERE m.trip_id = ? AND m.active = 1
			 ORDER BY m.sort_order, p.display_name COLLATE NOCASE`
		)
		.all(tripId) as MemberRow[];
	return rows.map((row) => ({ id: row.id, name: row.name, optedOut: row.opted_out === 1 }));
}

function audit(
	db: Database.Database,
	tripId: string,
	eventType: string,
	metadata: Record<string, unknown>,
	now: string
): void {
	db.prepare(
		`INSERT INTO trip_audit_log
		 (id, trip_id, event_type, actor_session_hash, metadata_json, created_at)
		 VALUES (?, ?, ?, NULL, ?, ?)`
	).run(crypto.randomUUID(), tripId, eventType, JSON.stringify(metadata), now);
}

export async function handleRuleBookPreference(
	request: Request,
	db: Database.Database,
	tripId: string,
	now: () => Date = () => new Date()
): Promise<Response> {
	const parsed = await parseJsonRequest(request, preferenceSchema);
	if (!parsed.success) return apiError('INVALID_REQUEST', 400);
	const member = db
		.prepare('SELECT active FROM trip_members WHERE trip_id = ? AND person_id = ?')
		.get(tripId, parsed.data.personId) as { active: number } | undefined;
	if (member?.active !== 1) return apiError('MEMBER_NOT_FOUND', 404);
	const updatedAt = now().toISOString();
	db.transaction(() => {
		if (parsed.data.optedOut) {
			db.prepare(
				`INSERT INTO trip_member_module_preferences
				 (trip_id, person_id, module_id, opted_out, updated_at)
				 VALUES (?, ?, 'rule-book', 1, ?)
				 ON CONFLICT(trip_id, person_id, module_id) DO UPDATE SET
				   opted_out = 1, updated_at = excluded.updated_at`
			).run(tripId, parsed.data.personId, updatedAt);
		} else {
			db.prepare(
				`DELETE FROM trip_member_module_preferences
				 WHERE trip_id = ? AND person_id = ? AND module_id = 'rule-book'`
			).run(tripId, parsed.data.personId);
		}
		audit(
			db,
			tripId,
			'rule-book.preference.changed',
			{ personId: parsed.data.personId, optedOut: parsed.data.optedOut },
			updatedAt
		);
	})();
	return apiSuccess({ personId: parsed.data.personId, optedOut: parsed.data.optedOut });
}

export async function handleStartRuleBookGame(
	request: Request,
	db: Database.Database,
	tripId: string,
	now: () => Date = () => new Date(),
	random: () => number = Math.random
): Promise<Response> {
	const parsed = await parseJsonRequest(request, startSchema);
	if (!parsed.success) return apiError('INVALID_REQUEST', 400);
	const existing = db
		.prepare('SELECT value FROM trip_state_entries WHERE trip_id = ? AND key = ?')
		.get(tripId, ruleBookGameKey) as { value: string } | undefined;
	if (existing && activeRuleBookGameSchema.safeParse(JSON.parse(existing.value)).success) {
		return apiError('RULE_BOOK_ALREADY_STARTED', 409);
	}
	const participants = listRuleBookMembers(db, tripId)
		.filter((member) => !member.optedOut)
		.map((member) => ({ id: member.id, name: member.name }));
	if (participants.length < 2) return apiError('RULE_BOOK_NEEDS_MEMBERS', 409);
	const timestamp = now();
	const game = activeRuleBookGameSchema.parse({
		version: 1,
		status: 'active',
		participantOrder: shuffledParticipants(participants, random),
		startedAt: timestamp.toISOString(),
		startedBy: parsed.data.clientId
	});
	syncState(
		db,
		tripId,
		[
			{
				mutationId: crypto.randomUUID(),
				clientId: parsed.data.clientId,
				key: ruleBookGameKey,
				value: serializeRuleBookGame(game),
				clientTimestamp: timestamp.valueOf()
			}
		],
		() => timestamp
	);
	return apiSuccess(game);
}

export function handleResetRuleBookGame(
	db: Database.Database,
	tripId: string,
	clientId: string,
	now: () => Date = () => new Date()
): Response {
	const rule = db
		.prepare(
			`SELECT 1 FROM trip_state_entries
			 WHERE trip_id = ? AND key LIKE 'rule-book:rule:%' LIMIT 1`
		)
		.get(tripId);
	if (rule) return apiError('RULE_BOOK_HAS_RULES', 409);
	const timestamp = now();
	syncState(
		db,
		tripId,
		[
			{
				mutationId: crypto.randomUUID(),
				clientId,
				key: ruleBookGameKey,
				value: null,
				clientTimestamp: timestamp.valueOf()
			}
		],
		() => timestamp
	);
	return apiSuccess({ reset: true });
}
