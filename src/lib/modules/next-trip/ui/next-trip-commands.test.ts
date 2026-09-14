import { describe, expect, it } from 'vitest';

import type { NextTripPageData } from '../domain/next-trip';
import {
	addNextTripComment,
	deleteNextTripComment,
	deleteNextTripSuggestion,
	rateNextTripSuggestion,
	saveNextTripSuggestion,
	updateNextTripComment,
	updateNextTripSuggestion
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

	it('rejects invalid URLs before request creation', () => {
		expect(() =>
			saveNextTripSuggestion(data, {
				destination: 'Svalbard',
				note: '',
				url: 'https://',
				submittedByPersonId: personId
			})
		).toThrow();
	});

	it('replaces an existing rating in the request snapshot', () => {
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
						updatedAt: '2026-01-01T00:00:00.000Z',
						comments: [],
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

	it('deletes a suggestion in the request snapshot', () => {
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
						updatedAt: '2026-01-01T00:00:00.000Z',
						comments: [],
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

	it('updates a suggestion with the strict edit payload', () => {
		const suggestionId = '00000000-0000-4000-8000-000000000002';
		const suggestion = saveNextTripSuggestion(
			data,
			{
				destination: 'Svalbard',
				note: '',
				url: '',
				submittedByPersonId: personId
			},
			() => suggestionId
		).next;
		const mutation = updateNextTripSuggestion(suggestion, suggestionId, {
			destination: 'Longyearbyen',
			note: 'Nordlys',
			url: 'https://example.com'
		});

		expect(mutation.requests).toEqual([
			{
				path: `/api/next-trip/suggestions/${suggestionId}`,
				method: 'PATCH',
				body: {
					destination: 'Longyearbyen',
					note: 'Nordlys',
					url: 'https://example.com'
				}
			}
		]);
	});

	it('creates, updates, and deletes comments', () => {
		const suggestionId = '00000000-0000-4000-8000-000000000002';
		const commentId = '00000000-0000-4000-8000-000000000003';
		const suggestion = saveNextTripSuggestion(
			data,
			{
				destination: 'Svalbard',
				note: '',
				url: '',
				submittedByPersonId: personId
			},
			() => suggestionId
		).next;
		const added = addNextTripComment(
			suggestion,
			suggestionId,
			personId,
			'God idé',
			() => commentId
		);
		const updated = updateNextTripComment(added.next, suggestionId, commentId, 'Veldig god idé');
		const deleted = deleteNextTripComment(updated.next, suggestionId, commentId);

		expect(added.requests[0]).toEqual({
			path: `/api/next-trip/suggestions/${suggestionId}/comments`,
			method: 'POST',
			body: { id: commentId, personId, body: 'God idé' }
		});
		expect(updated.requests[0]).toEqual({
			path: `/api/next-trip/suggestions/${suggestionId}/comments/${commentId}`,
			method: 'PATCH',
			body: { body: 'Veldig god idé' }
		});
		expect(deleted.requests[0]).toEqual({
			path: `/api/next-trip/suggestions/${suggestionId}/comments/${commentId}`,
			method: 'DELETE'
		});
		expect(deleted.next.suggestions[0]?.comments).toEqual([]);
	});
});
