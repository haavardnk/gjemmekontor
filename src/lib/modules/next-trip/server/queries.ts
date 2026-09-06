import type Database from 'better-sqlite3';

import type { NextTripPageData, NextTripRating, NextTripSuggestion } from '../domain/next-trip';

type PersonRow = {
	id: string;
	name: string;
};

type SuggestionRow = Omit<NextTripSuggestion, 'ratings'>;

export function loadNextTripPageData(db: Database.Database, tripId: string): NextTripPageData {
	const people = db
		.prepare(
			`SELECT p.id, COALESCE(member.trip_label, p.display_name) AS name
			 FROM trip_members member
			 JOIN people p ON p.id = member.person_id
			 WHERE member.trip_id = ? AND member.active = 1
			 ORDER BY member.sort_order, p.display_name COLLATE NOCASE`
		)
		.all(tripId) as PersonRow[];
	const suggestions = db
		.prepare(
			`SELECT suggestion.id, suggestion.destination, suggestion.note, suggestion.url,
			        suggestion.submitted_by_person_id AS submittedByPersonId,
			        COALESCE(submitter.trip_label, p.display_name) AS submittedByName,
			        suggestion.created_at AS createdAt
			 FROM next_trip_suggestions suggestion
			 JOIN trip_members submitter
			   ON submitter.trip_id = suggestion.trip_id
			  AND submitter.person_id = suggestion.submitted_by_person_id
			 JOIN people p ON p.id = submitter.person_id
			 WHERE suggestion.trip_id = ?
			 ORDER BY suggestion.created_at DESC, suggestion.id`
		)
		.all(tripId) as SuggestionRow[];
	const ratings = db
		.prepare(
			`SELECT suggestion_id AS suggestionId, person_id AS personId, score
			 FROM next_trip_ratings WHERE trip_id = ? ORDER BY person_id`
		)
		.all(tripId) as Array<NextTripRating & { suggestionId: string }>;
	const ratingsBySuggestion = new Map<string, NextTripRating[]>();
	for (const rating of ratings) {
		const list = ratingsBySuggestion.get(rating.suggestionId) ?? [];
		list.push({ personId: rating.personId, score: rating.score });
		ratingsBySuggestion.set(rating.suggestionId, list);
	}
	return {
		people,
		suggestions: suggestions.map((suggestion) => ({
			...suggestion,
			ratings: ratingsBySuggestion.get(suggestion.id) ?? []
		}))
	};
}

export function isNextTripMember(db: Database.Database, tripId: string, personId: string): boolean {
	return Boolean(
		db
			.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND person_id = ?')
			.get(tripId, personId)
	);
}
