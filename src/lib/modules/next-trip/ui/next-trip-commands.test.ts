import { describe, expect, it } from 'vitest';

import type { NextTripPageData } from '../domain/next-trip';
import {
	deleteNextTripSuggestion,
	rateNextTripSuggestion,
	saveNextTripSuggestion
} from './next-trip-commands';

const personId = '00000000-0000-4000-8000-000000000001';

const data: NextTripPageData = {
	people: [{ id: personId, name: 'Håvard' }],
	suggestions: []
};

describe('next trip commands', () => {
	it('sends only fields accepted by the suggestion API', () => {
		const mutation = saveNextTripSuggestion(
			data,
			{
				destination: 'Svalbard',
				note: 'Nordlys',
				url: 'https://example.com',
				submittedByPersonId: personId
			},
			() => '00000000-0000-4000-8000-000000000002'
		);

		expect(mutation.requests[0]?.body).toEqual({
			id: '00000000-0000-4000-8000-000000000002',
			destination: 'Svalbard',
			note: 'Nordlys',
			url: 'https://example.com',
			submittedByPersonId: personId
		});
	});

	it('rejects invalid URLs before optimistic storage', () => {
		expect(() =>
			saveNextTripSuggestion(data, {
				destination: 'Svalbard',
				note: '',
				url: 'https://',
				submittedByPersonId: personId
			})
		).toThrow();
	});

	it('replaces an existing optimistic rating', () => {
		const suggestionId = '00000000-0000-4000-8000-000000000002';
		const mutation = rateNextTripSuggestion(
			{
				...data,
				suggestions: [
					{
						id: suggestionId,
						destination: 'Svalbard',
						note: '',
						url: '',
						submittedByPersonId: personId,
						submittedByName: 'Håvard',
						createdAt: '2026-01-01T00:00:00.000Z',
						ratings: [{ personId, score: 2 }]
					}
				]
			},
			suggestionId,
			personId,
			5
		);

		expect(mutation.next.suggestions[0]?.ratings).toEqual([{ personId, score: 5 }]);
	});

	it('deletes a suggestion optimistically', () => {
		const suggestionId = '00000000-0000-4000-8000-000000000002';
		const mutation = deleteNextTripSuggestion(
			{
				...data,
				suggestions: [
					{
						id: suggestionId,
						destination: 'Svalbard',
						note: '',
						url: '',
						submittedByPersonId: personId,
						submittedByName: 'Håvard',
						createdAt: '2026-01-01T00:00:00.000Z',
						ratings: []
					}
				]
			},
			suggestionId
		);

		expect(mutation.next.suggestions).toEqual([]);
		expect(mutation.requests).toEqual([
			{
				path: `/api/next-trip/suggestions/${suggestionId}`,
				method: 'DELETE'
			}
		]);
	});
});
