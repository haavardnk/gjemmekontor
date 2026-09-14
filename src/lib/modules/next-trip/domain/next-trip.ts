import { z } from 'zod';

export const nextTripSortValues = ['best', 'newest', 'name'] as const;
export type NextTripSort = (typeof nextTripSortValues)[number];

export type NextTripPerson = {
	id: string;
	name: string;
};

export type NextTripRating = {
	personId: string;
	score: number;
};

export type NextTripComment = {
	id: string;
	personId: string;
	personName: string;
	body: string;
	createdAt: string;
	updatedAt: string;
};

export type NextTripSuggestion = {
	id: string;
	destination: string;
	note: string;
	url: string;
	submittedByPersonId: string;
	submittedByName: string;
	createdAt: string;
	updatedAt: string;
	ratings: NextTripRating[];
	comments: NextTripComment[];
};

export type NextTripPageData = {
	people: NextTripPerson[];
	suggestions: NextTripSuggestion[];
};

const nextTripUrlSchema = z
	.string()
	.trim()
	.max(2000)
	.refine((value) => {
		if (!value) return true;
		try {
			return ['http:', 'https:'].includes(new URL(value).protocol);
		} catch {
			return false;
		}
	});

export const nextTripSuggestionEditInputSchema = z
	.object({
		destination: z.string().trim().min(1).max(200),
		note: z.string().trim().max(1000),
		url: nextTripUrlSchema
	})
	.strict();

export const nextTripSuggestionInputSchema = nextTripSuggestionEditInputSchema
	.extend({
		id: z.uuid(),
		submittedByPersonId: z.uuid()
	})
	.strict();

export const nextTripCommentInputSchema = z
	.object({
		id: z.uuid(),
		personId: z.uuid(),
		body: z.string().trim().min(1).max(2000)
	})
	.strict();

export const nextTripCommentEditInputSchema = z
	.object({ body: z.string().trim().min(1).max(2000) })
	.strict();

export const nextTripRatingInputSchema = z
	.object({ personId: z.uuid(), score: z.number().int().min(1).max(5) })
	.strict();

export const nextTripPageDataSchema = z
	.object({
		people: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
		suggestions: z.array(
			z
				.object({
					id: z.uuid(),
					destination: z.string().min(1),
					note: z.string(),
					url: z.string(),
					submittedByPersonId: z.uuid(),
					submittedByName: z.string(),
					createdAt: z.iso.datetime(),
					updatedAt: z.iso.datetime(),
					ratings: z.array(
						z
							.object({
								personId: z.uuid(),
								score: z.number().int().min(1).max(5)
							})
							.strict()
					),
					comments: z.array(
						z
							.object({
								id: z.uuid(),
								personId: z.uuid(),
								personName: z.string(),
								body: z.string().min(1),
								createdAt: z.iso.datetime(),
								updatedAt: z.iso.datetime()
							})
							.strict()
					)
				})
				.strict()
		)
	})
	.strict();

export function suggestionRatingSummary(suggestion: NextTripSuggestion): {
	average: number;
	count: number;
} {
	const count = suggestion.ratings.length;
	const average = count
		? suggestion.ratings.reduce((total, rating) => total + rating.score, 0) / count
		: 0;
	return { average, count };
}

export function upsertSuggestionRating(
	suggestion: NextTripSuggestion,
	personId: string,
	score: number
): NextTripSuggestion {
	if (!Number.isInteger(score) || score < 1 || score > 5)
		throw new Error('NEXT_TRIP_SCORE_INVALID');
	const rating = { personId, score };
	const existing = suggestion.ratings.some((candidate) => candidate.personId === personId);
	return {
		...suggestion,
		ratings: existing
			? suggestion.ratings.map((candidate) =>
					candidate.personId === personId ? rating : candidate
				)
			: [...suggestion.ratings, rating]
	};
}

const norwegianCollator = new Intl.Collator('nb-NO', { sensitivity: 'base' });

export function sortNextTripSuggestions(
	suggestions: readonly NextTripSuggestion[],
	sort: NextTripSort
): NextTripSuggestion[] {
	return [...suggestions].sort((left, right) => {
		if (sort === 'best') {
			const averageDifference =
				suggestionRatingSummary(right).average - suggestionRatingSummary(left).average;
			if (averageDifference) return averageDifference;
			const countDifference = right.ratings.length - left.ratings.length;
			if (countDifference) return countDifference;
		}
		if (sort === 'newest') {
			const dateDifference = right.createdAt.localeCompare(left.createdAt);
			if (dateDifference) return dateDifference;
		}
		if (sort === 'name') {
			const nameDifference = norwegianCollator.compare(left.destination, right.destination);
			if (nameDifference) return nameDifference;
		}
		return (
			norwegianCollator.compare(left.destination, right.destination) ||
			left.id.localeCompare(right.id)
		);
	});
}
