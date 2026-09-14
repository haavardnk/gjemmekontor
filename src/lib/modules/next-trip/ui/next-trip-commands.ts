import type { CachedResourceMutation } from '$lib/client/cached-resource';

import {
	nextTripCommentEditInputSchema,
	nextTripCommentInputSchema,
	type NextTripPageData,
	nextTripRatingInputSchema,
	nextTripSuggestionEditInputSchema,
	nextTripSuggestionInputSchema,
	upsertSuggestionRating
} from '../domain/next-trip';

export type NextTripMutation = CachedResourceMutation<NextTripPageData>;

export function updateNextTripSuggestion(
	data: NextTripPageData,
	suggestionId: string,
	draft: { destination: string; note: string; url: string }
): NextTripMutation {
	const input = nextTripSuggestionEditInputSchema.parse(draft);
	if (!data.suggestions.some((suggestion) => suggestion.id === suggestionId)) {
		throw new Error('NEXT_TRIP_SUGGESTION_NOT_FOUND');
	}
	return {
		next: {
			...data,
			suggestions: data.suggestions.map((suggestion) =>
				suggestion.id === suggestionId
					? { ...suggestion, ...input, updatedAt: new Date().toISOString() }
					: suggestion
			)
		},
		requests: [
			{
				path: `/api/next-trip/suggestions/${suggestionId}`,
				method: 'PATCH',
				body: input
			}
		]
	};
}

export function deleteNextTripSuggestion(
	data: NextTripPageData,
	suggestionId: string
): NextTripMutation {
	return {
		next: {
			...data,
			suggestions: data.suggestions.filter((suggestion) => suggestion.id !== suggestionId)
		},
		requests: [
			{
				path: `/api/next-trip/suggestions/${suggestionId}`,
				method: 'DELETE'
			}
		]
	};
}

export function saveNextTripSuggestion(
	data: NextTripPageData,
	draft: { destination: string; note: string; url: string; submittedByPersonId: string },
	randomId: () => string = () => crypto.randomUUID()
): NextTripMutation {
	const person = data.people.find((candidate) => candidate.id === draft.submittedByPersonId);
	if (!person) throw new Error('NEXT_TRIP_MEMBER_REQUIRED');
	const input = nextTripSuggestionInputSchema.parse({ ...draft, id: randomId() });
	const now = new Date().toISOString();
	const suggestion = {
		...input,
		submittedByPersonId: person.id,
		submittedByName: person.name,
		createdAt: now,
		updatedAt: now,
		ratings: [],
		comments: []
	};
	return {
		next: { ...data, suggestions: [suggestion, ...data.suggestions] },
		requests: [
			{
				path: '/api/next-trip/suggestions',
				method: 'POST',
				body: input
			}
		]
	};
}

export function addNextTripComment(
	data: NextTripPageData,
	suggestionId: string,
	personId: string,
	body: string,
	randomId: () => string = () => crypto.randomUUID()
): NextTripMutation {
	const person = data.people.find((candidate) => candidate.id === personId);
	if (!person) throw new Error('NEXT_TRIP_MEMBER_REQUIRED');
	const suggestion = data.suggestions.find((candidate) => candidate.id === suggestionId);
	if (!suggestion) throw new Error('NEXT_TRIP_SUGGESTION_NOT_FOUND');
	const input = nextTripCommentInputSchema.parse({ id: randomId(), personId, body });
	const now = new Date().toISOString();
	return {
		next: {
			...data,
			suggestions: data.suggestions.map((candidate) =>
				candidate.id === suggestionId
					? {
							...candidate,
							comments: [
								...candidate.comments,
								{
									id: input.id,
									personId,
									personName: person.name,
									body: input.body,
									createdAt: now,
									updatedAt: now
								}
							]
						}
					: candidate
			)
		},
		requests: [
			{
				path: `/api/next-trip/suggestions/${suggestionId}/comments`,
				method: 'POST',
				body: input
			}
		]
	};
}

export function updateNextTripComment(
	data: NextTripPageData,
	suggestionId: string,
	commentId: string,
	body: string
): NextTripMutation {
	const input = nextTripCommentEditInputSchema.parse({ body });
	const suggestion = data.suggestions.find((candidate) => candidate.id === suggestionId);
	if (!suggestion?.comments.some((comment) => comment.id === commentId)) {
		throw new Error('NEXT_TRIP_COMMENT_NOT_FOUND');
	}
	return {
		next: {
			...data,
			suggestions: data.suggestions.map((candidate) =>
				candidate.id === suggestionId
					? {
							...candidate,
							comments: candidate.comments.map((comment) =>
								comment.id === commentId
									? { ...comment, body: input.body, updatedAt: new Date().toISOString() }
									: comment
							)
						}
					: candidate
			)
		},
		requests: [
			{
				path: `/api/next-trip/suggestions/${suggestionId}/comments/${commentId}`,
				method: 'PATCH',
				body: input
			}
		]
	};
}

export function deleteNextTripComment(
	data: NextTripPageData,
	suggestionId: string,
	commentId: string
): NextTripMutation {
	const suggestion = data.suggestions.find((candidate) => candidate.id === suggestionId);
	if (!suggestion?.comments.some((comment) => comment.id === commentId)) {
		throw new Error('NEXT_TRIP_COMMENT_NOT_FOUND');
	}
	return {
		next: {
			...data,
			suggestions: data.suggestions.map((candidate) =>
				candidate.id === suggestionId
					? {
							...candidate,
							comments: candidate.comments.filter((comment) => comment.id !== commentId)
						}
					: candidate
			)
		},
		requests: [
			{
				path: `/api/next-trip/suggestions/${suggestionId}/comments/${commentId}`,
				method: 'DELETE'
			}
		]
	};
}

export function rateNextTripSuggestion(
	data: NextTripPageData,
	suggestionId: string,
	personId: string,
	score: number
): NextTripMutation {
	const input = nextTripRatingInputSchema.parse({ personId, score });
	if (!data.people.some((person) => person.id === personId))
		throw new Error('NEXT_TRIP_MEMBER_REQUIRED');
	if (!data.suggestions.some((suggestion) => suggestion.id === suggestionId)) {
		throw new Error('NEXT_TRIP_SUGGESTION_NOT_FOUND');
	}
	return {
		next: {
			...data,
			suggestions: data.suggestions.map((suggestion) =>
				suggestion.id === suggestionId
					? upsertSuggestionRating(suggestion, personId, score)
					: suggestion
			)
		},
		requests: [
			{
				path: `/api/next-trip/suggestions/${suggestionId}/ratings`,
				method: 'PUT',
				body: input
			}
		]
	};
}
