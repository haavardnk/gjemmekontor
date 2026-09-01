import { describe, expect, test } from 'vitest';

import type { JsonValue } from '$lib/client/database';

import {
	activeRuleBookGameSchema,
	nextSectionNumber,
	participantForDay,
	ruleBookGame,
	ruleBookGameKey,
	ruleBookRuleKey,
	ruleBookRules,
	shuffledParticipants
} from './rule-book';

const participants = [
	{ id: '48be192b-0cf6-4697-a4c5-707b77815d4f', name: 'Ada' },
	{ id: '4d32474c-83a9-4255-86b3-eac6329cd10c', name: 'Bo' },
	{ id: '1880ed38-fb38-4d4d-9d5d-36039be9ea25', name: 'Cleo' }
];

describe('rule book', () => {
	test('shuffles a copy once without losing participants', () => {
		const values = [0.1, 0.8];
		const shuffled = shuffledParticipants(participants, () => values.shift() ?? 0);

		expect(shuffled.map((participant) => participant.name)).toEqual(['Cleo', 'Bo', 'Ada']);
		expect(shuffled).not.toBe(participants);
		expect(participants.map((participant) => participant.name)).toEqual(['Ada', 'Bo', 'Cleo']);
	});

	test('rotates through the persisted order for every trip day', () => {
		const game = activeRuleBookGameSchema.parse({
			version: 1,
			status: 'active',
			participantOrder: participants,
			startedAt: '2026-08-27T10:00:00.000Z',
			startedBy: 'client-1'
		});

		expect([0, 1, 2, 3, 4, 5].map((day) => participantForDay(game, day).name)).toEqual([
			'Ada',
			'Bo',
			'Cleo',
			'Ada',
			'Bo',
			'Cleo'
		]);
	});

	test('reads valid state, ignores malformed entries, and orders sections', () => {
		const values: Record<string, JsonValue> = {
			[ruleBookGameKey]: {
				version: 1,
				status: 'setup',
				participants
			},
			[ruleBookRuleKey(1)]: {
				version: 1,
				dayIndex: 1,
				sectionNumber: 2,
				text: 'Andre regel',
				createdAt: '2027-06-02T10:00:00.000Z',
				createdBy: 'client-1',
				updatedAt: '2027-06-02T10:00:00.000Z'
			},
			[ruleBookRuleKey(0)]: {
				version: 1,
				dayIndex: 0,
				sectionNumber: 1,
				text: 'Første regel',
				createdAt: '2027-06-01T10:00:00.000Z',
				createdBy: 'client-1',
				updatedAt: '2027-06-01T10:00:00.000Z'
			},
			'rule-book:rule:broken': { text: 'Ugyldig' }
		};

		expect(ruleBookGame(values)?.status).toBe('setup');
		expect(ruleBookRules(values, 19).map((rule) => rule.text)).toEqual([
			'Første regel',
			'Andre regel'
		]);
		expect(nextSectionNumber(ruleBookRules(values, 19))).toBe(3);
	});
});
