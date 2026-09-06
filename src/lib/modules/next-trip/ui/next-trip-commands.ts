import type { OfflineResourceMutation } from '$lib/client/offline-resource';

import {
	type NextTripPageData,
	nextTripRatingInputSchema,
	nextTripSuggestionInputSchema,
	upsertSuggestionRating
} from '../domain/next-trip';

export type NextTripMutation = OfflineResourceMutation<NextTripPageData>;

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
		ratings: []
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
