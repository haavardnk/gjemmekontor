import { describe, expect, it } from 'vitest';

import {
	type NextTripSuggestion,
	sortNextTripSuggestions,
	suggestionRatingSummary,
	upsertSuggestionRating
} from './next-trip';

const suggestion = (
	id: string,
	destination: string,
	ratings: NextTripSuggestion['ratings'] = []
) => ({
	id,
	destination,
	note: '',
	url: '',
	submittedByPersonId: '00000000-0000-4000-8000-000000000001',
	submittedByName: 'Håvard',
	createdAt: '2026-01-01T00:00:00.000Z',
	ratings
});

describe('next trip domain', () => {
	it('replaces a member rating instead of adding a duplicate', () => {
		const original = suggestion('00000000-0000-4000-8000-000000000002', 'Svalbard', [
			{ personId: 'person-1', score: 2 }
		]);

		const updated = upsertSuggestionRating(original, 'person-1', 5);

		expect(updated.ratings).toEqual([{ personId: 'person-1', score: 5 }]);
	});

	it('summarizes average, count, and distribution', () => {
		const result = suggestion('00000000-0000-4000-8000-000000000002', 'Svalbard', [
			{ personId: 'person-1', score: 5 },
			{ personId: 'person-2', score: 3 },
			{ personId: 'person-3', score: 5 }
		]);

		expect(suggestionRatingSummary(result)).toEqual({
			average: 13 / 3,
			count: 3
		});
	});

	it('sorts by average, then rating count, then name', () => {
		const entries = [
			suggestion('00000000-0000-4000-8000-000000000002', 'Bergen', [
				{ personId: 'person-1', score: 5 }
			]),
			suggestion('00000000-0000-4000-8000-000000000003', 'Ålesund', [
				{ personId: 'person-1', score: 4 },
				{ personId: 'person-2', score: 4 }
			]),
			suggestion('00000000-0000-4000-8000-000000000004', 'Oslo')
		];

		expect(sortNextTripSuggestions(entries, 'best').map((entry) => entry.destination)).toEqual([
			'Bergen',
			'Ålesund',
			'Oslo'
		]);
	});
});
