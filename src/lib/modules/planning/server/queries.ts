import type Database from 'better-sqlite3';

import type {
	PlanningCard,
	PlanningCategory,
	PlanningChecklistItem,
	PlanningLink,
	PlanningPageData,
	PlanningPerson,
	PlanningPhoto
} from '../domain/planning';

type CardRow = Omit<PlanningCard, 'place' | 'checklist' | 'links' | 'photos'> & {
	placeLabel: string | null;
	placeLat: number | null;
	placeLng: number | null;
	placeGoogleId: string | null;
};
type ChecklistRow = Omit<PlanningChecklistItem, 'checked'> & { cardId: string; checked: number };
type LinkRow = Omit<PlanningLink, 'hasImage'> & { cardId: string; hasImage: number };
type PhotoRow = PlanningPhoto & { cardId: string };

export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const row of rows) {
		const group = groups.get(key(row));
		if (group) group.push(row);
		else groups.set(key(row), [row]);
	}
	return groups;
}

export function loadPlanningPeople(db: Database.Database, tripId: string): PlanningPerson[] {
	return db
		.prepare(
			`SELECT p.id, COALESCE(member.trip_label, p.display_name) AS name
			 FROM trip_members member
			 JOIN people p ON p.id = member.person_id
			 WHERE member.trip_id = ? AND member.active = 1
			 ORDER BY member.sort_order, p.display_name COLLATE NOCASE`
		)
		.all(tripId) as PlanningPerson[];
}

export function loadPlanningPageData(db: Database.Database, tripId: string): PlanningPageData {
	const categories = db
		.prepare(
			`SELECT id, name, color FROM planning_categories
			 WHERE trip_id = ? ORDER BY position, created_at, id`
		)
		.all(tripId) as PlanningCategory[];
	const cards = db
		.prepare(
			`SELECT card.id, card.category_id AS categoryId, card.title, card.body,
			        card.place_label AS placeLabel, card.place_lat AS placeLat,
			        card.place_lng AS placeLng, card.place_google_id AS placeGoogleId,
			        card.created_by_person_id AS createdByPersonId,
			        COALESCE(member.trip_label, person.display_name) AS createdByName,
			        card.created_at AS createdAt, card.updated_at AS updatedAt
			 FROM planning_cards card
			 JOIN trip_members member
			   ON member.trip_id = card.trip_id AND member.person_id = card.created_by_person_id
			 JOIN people person ON person.id = member.person_id
			 WHERE card.trip_id = ?
			 ORDER BY card.position, card.created_at, card.id`
		)
		.all(tripId) as CardRow[];
	const checklist = groupBy(
		db
			.prepare(
				`SELECT id, card_id AS cardId, text, checked_at IS NOT NULL AS checked,
				        checked_by_person_id AS checkedByPersonId
				 FROM planning_checklist_items WHERE trip_id = ? ORDER BY position, id`
			)
			.all(tripId) as ChecklistRow[],
		(row) => row.cardId
	);
	const links = groupBy(
		db
			.prepare(
				`SELECT id, card_id AS cardId, url, status, title, description, site_name AS siteName,
				        image_type IS NOT NULL AS hasImage
				 FROM planning_card_links WHERE trip_id = ? ORDER BY position, id`
			)
			.all(tripId) as LinkRow[],
		(row) => row.cardId
	);
	const photos = groupBy(
		db
			.prepare(
				`SELECT id, card_id AS cardId, width, height
				 FROM planning_card_photos WHERE trip_id = ? ORDER BY position, id`
			)
			.all(tripId) as PhotoRow[],
		(row) => row.cardId
	);
	return {
		people: loadPlanningPeople(db, tripId),
		categories,
		cards: cards.map(({ placeLabel, placeLat, placeLng, placeGoogleId, ...card }) => ({
			...card,
			place: placeLabel
				? { label: placeLabel, lat: placeLat, lng: placeLng, googlePlaceId: placeGoogleId }
				: null,
			checklist: (checklist.get(card.id) ?? []).map((item) => ({
				id: item.id,
				text: item.text,
				checked: Boolean(item.checked),
				checkedByPersonId: item.checkedByPersonId
			})),
			links: (links.get(card.id) ?? []).map((link) => ({
				id: link.id,
				url: link.url,
				status: link.status,
				title: link.title,
				description: link.description,
				siteName: link.siteName,
				hasImage: Boolean(link.hasImage)
			})),
			photos: (photos.get(card.id) ?? []).map(({ id, width, height }) => ({ id, width, height }))
		}))
	};
}

export function isActivePlanningMember(
	db: Database.Database,
	tripId: string,
	personId: string
): boolean {
	return Boolean(
		db
			.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND person_id = ? AND active = 1')
			.get(tripId, personId)
	);
}

export function planningCategoryExists(
	db: Database.Database,
	tripId: string,
	categoryId: string
): boolean {
	return Boolean(
		db
			.prepare('SELECT 1 FROM planning_categories WHERE trip_id = ? AND id = ?')
			.get(tripId, categoryId)
	);
}

export function planningCardCategory(
	db: Database.Database,
	tripId: string,
	cardId: string
): { categoryId: string | null } | undefined {
	return db
		.prepare('SELECT category_id AS categoryId FROM planning_cards WHERE trip_id = ? AND id = ?')
		.get(tripId, cardId) as { categoryId: string | null } | undefined;
}

export function planningSectionCardIds(
	db: Database.Database,
	tripId: string,
	categoryId: string | null
): string[] {
	return (
		db
			.prepare(
				`SELECT id FROM planning_cards WHERE trip_id = ? AND category_id IS ?
				 ORDER BY position, created_at, id`
			)
			.all(tripId, categoryId) as Array<{ id: string }>
	).map((row) => row.id);
}

export function writePlanningSection(
	db: Database.Database,
	tripId: string,
	categoryId: string | null,
	cardIds: readonly string[]
): void {
	const update = db.prepare(
		'UPDATE planning_cards SET category_id = ?, position = ? WHERE trip_id = ? AND id = ?'
	);
	for (const [position, cardId] of cardIds.entries())
		update.run(categoryId, position, tripId, cardId);
}
