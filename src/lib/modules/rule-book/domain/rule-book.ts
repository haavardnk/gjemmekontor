import { z } from 'zod';

import type { JsonValue } from '$lib/client/database';

export const ruleBookGameKey = 'rule-book:game';
const rulePrefix = 'rule-book:rule:';
const preferencePrefix = 'rule-book:preference:';

export const ruleBookParticipantSchema = z
	.object({
		id: z.uuid(),
		name: z.string().trim().min(1).max(100)
	})
	.strict();

export const ruleBookSetupSchema = z
	.object({
		version: z.literal(1),
		status: z.literal('setup'),
		participants: z.array(ruleBookParticipantSchema).max(50)
	})
	.strict();

export const activeRuleBookGameSchema = z
	.object({
		version: z.literal(1),
		status: z.literal('active'),
		participantOrder: z.array(ruleBookParticipantSchema).min(2).max(50),
		startedAt: z.iso.datetime(),
		startedBy: z.string().min(1).max(128)
	})
	.strict();

export const ruleBookGameSchema = z.discriminatedUnion('status', [
	ruleBookSetupSchema,
	activeRuleBookGameSchema
]);

const ruleBookRuleSchema = z
	.object({
		version: z.literal(1),
		dayIndex: z.number().int().min(0),
		sectionNumber: z.number().int().positive(),
		text: z.string().trim().min(1).max(500),
		createdAt: z.iso.datetime(),
		createdBy: z.string().min(1).max(128),
		updatedAt: z.iso.datetime()
	})
	.strict();

export type RuleBookParticipant = z.infer<typeof ruleBookParticipantSchema>;
export type RuleBookSetup = z.infer<typeof ruleBookSetupSchema>;
export type ActiveRuleBookGame = z.infer<typeof activeRuleBookGameSchema>;
export type RuleBookGame = z.infer<typeof ruleBookGameSchema>;
export type RuleBookRule = z.infer<typeof ruleBookRuleSchema>;
export type RuleBookMember = { id: string; name: string; optedOut: boolean };

export function ruleBookRuleKey(dayIndex: number): string {
	return `${rulePrefix}${dayIndex}`;
}

export function ruleBookPreferenceKey(personId: string): string {
	return `${preferencePrefix}${personId}`;
}

export function ruleBookMemberOptedOut(
	values: Record<string, JsonValue>,
	personId: string,
	fallback = false
): boolean {
	const value = values[ruleBookPreferenceKey(personId)];
	return typeof value === 'boolean' ? value : fallback;
}

export function ruleBookGame(values: Record<string, JsonValue>): RuleBookGame | undefined {
	const parsed = ruleBookGameSchema.safeParse(values[ruleBookGameKey]);
	return parsed.success ? parsed.data : undefined;
}

function validRuleDay(rule: RuleBookRule, dayCount: number): boolean {
	return rule.dayIndex < dayCount && rule.sectionNumber <= dayCount;
}

export function parseRuleBookRule(value: unknown, dayCount: number): RuleBookRule {
	const rule = ruleBookRuleSchema.parse(value);
	if (!validRuleDay(rule, dayCount)) throw new Error('INVALID_RULE_BOOK_DAY');
	return rule;
}

export function ruleBookRules(values: Record<string, JsonValue>, dayCount: number): RuleBookRule[] {
	return Object.entries(values)
		.filter(([key]) => key.startsWith(rulePrefix))
		.flatMap(([key, value]) => {
			const parsed = ruleBookRuleSchema.safeParse(value);
			return parsed.success &&
				validRuleDay(parsed.data, dayCount) &&
				key === ruleBookRuleKey(parsed.data.dayIndex)
				? [parsed.data]
				: [];
		})
		.sort(
			(left, right) => left.sectionNumber - right.sectionNumber || left.dayIndex - right.dayIndex
		);
}

export function ruleForDay(
	rules: readonly RuleBookRule[],
	dayIndex: number
): RuleBookRule | undefined {
	return rules.find((rule) => rule.dayIndex === dayIndex);
}

export function nextSectionNumber(rules: readonly RuleBookRule[]): number {
	return rules.reduce((highest, rule) => Math.max(highest, rule.sectionNumber), 0) + 1;
}

export function participantForDay(game: ActiveRuleBookGame, dayIndex: number): RuleBookParticipant {
	return game.participantOrder[dayIndex % game.participantOrder.length] as RuleBookParticipant;
}

export function shuffledParticipants(
	participants: readonly RuleBookParticipant[],
	random: () => number = Math.random
): RuleBookParticipant[] {
	const shuffled = participants.map((participant) => ({ ...participant }));
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const target = Math.floor(random() * (index + 1));
		[shuffled[index], shuffled[target]] = [
			shuffled[target] as RuleBookParticipant,
			shuffled[index] as RuleBookParticipant
		];
	}
	return shuffled;
}

export function serializeRuleBookGame(game: RuleBookGame): JsonValue {
	if (game.status === 'setup') {
		return {
			version: game.version,
			status: game.status,
			participants: game.participants.map((participant) => ({ ...participant }))
		};
	}
	return {
		version: game.version,
		status: game.status,
		participantOrder: game.participantOrder.map((participant) => ({ ...participant })),
		startedAt: game.startedAt,
		startedBy: game.startedBy
	};
}

export function serializeRuleBookRule(rule: RuleBookRule): JsonValue {
	return {
		version: rule.version,
		dayIndex: rule.dayIndex,
		sectionNumber: rule.sectionNumber,
		text: rule.text,
		createdAt: rule.createdAt,
		createdBy: rule.createdBy,
		updatedAt: rule.updatedAt
	};
}
