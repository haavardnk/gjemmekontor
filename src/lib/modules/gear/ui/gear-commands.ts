import type { OfflineResourceMutation } from '$lib/client/offline-resource';

import type { GearCategory, GearItemView, GearPageData } from '../domain/gear';
import type { GearCategoryDraft, GearItemDraft } from './gear-editor';

export type GearMutation = OfflineResourceMutation<GearPageData>;

export function saveGearCategory(
	data: GearPageData,
	draft: GearCategoryDraft,
	randomId: () => string = () => crypto.randomUUID()
): GearMutation {
	const name = draft.name.trim();
	if (!name) throw new Error('GEAR_CATEGORY_NAME_REQUIRED');
	if (
		data.categories.some(
			(category) =>
				category.id !== draft.editing?.id &&
				category.name.toLocaleLowerCase('nb-NO') === name.toLocaleLowerCase('nb-NO')
		)
	) {
		throw new Error('GEAR_CATEGORY_DUPLICATE');
	}
	const category: GearCategory = {
		id: draft.editing?.id ?? randomId(),
		name,
		position: draft.editing?.position ?? data.categories.length
	};
	return {
		next: {
			...data,
			categories: draft.editing
				? data.categories.map((candidate) => (candidate.id === category.id ? category : candidate))
				: [...data.categories, category]
		},
		requests: [{ path: '/api/gear/categories', method: 'POST', body: category }]
	};
}

export function saveGearItem(
	data: GearPageData,
	draft: GearItemDraft,
	randomId: () => string = () => crypto.randomUUID()
): GearMutation {
	const name = draft.name.trim();
	if (!name || !draft.categoryId) throw new Error('GEAR_ITEM_INVALID');
	const body = {
		id: draft.editing?.id ?? randomId(),
		categoryId: draft.categoryId,
		name,
		quantity: draft.quantity,
		ownerIds: draft.ownerIds,
		availability: draft.availability,
		notes: draft.notes.trim(),
		selected: draft.planned
	};
	const nextItem: GearItemView = {
		...body,
		packed: draft.planned ? (draft.editing?.packed ?? false) : false,
		needsOwnerResolution: false,
		retainedWithoutCurrentOwner: false
	};
	return {
		next: {
			...data,
			items: draft.editing
				? data.items.map((item) => (item.id === nextItem.id ? nextItem : item))
				: [...data.items, nextItem]
		},
		requests: [
			{
				path: draft.editing ? `/api/gear/items/${draft.editing.id}` : '/api/gear/items',
				method: draft.editing ? 'PUT' : 'POST',
				body
			}
		]
	};
}

export function archiveGearItem(data: GearPageData, itemId: string): GearMutation {
	return {
		next: { ...data, items: data.items.filter((item) => item.id !== itemId) },
		requests: [{ path: `/api/gear/items/${itemId}`, method: 'DELETE' }]
	};
}

export function setGearItemPlanned(
	data: GearPageData,
	itemId: string,
	planned: boolean
): GearMutation {
	return {
		next: {
			...data,
			items: data.items.map((item) =>
				item.id === itemId
					? { ...item, selected: planned, packed: planned ? item.packed : false }
					: item
			)
		},
		requests: [
			{
				path: `/api/gear/items/${itemId}/selection`,
				method: 'PATCH',
				body: { selected: planned }
			}
		]
	};
}

export function archiveGearCategory(data: GearPageData, categoryId: string): GearMutation {
	if (data.items.some((item) => item.categoryId === categoryId)) {
		throw new Error('GEAR_CATEGORY_NOT_EMPTY');
	}
	return {
		next: {
			...data,
			categories: data.categories.filter((category) => category.id !== categoryId)
		},
		requests: [{ path: `/api/gear/categories/${categoryId}`, method: 'DELETE' }]
	};
}

export function setGearItemPacked(
	data: GearPageData,
	itemId: string,
	packed: boolean
): GearMutation {
	const item = data.items.find((candidate) => candidate.id === itemId);
	if (!item || item.availability !== 'available') throw new Error('GEAR_ITEM_NOT_PACKABLE');
	return {
		next: {
			...data,
			items: data.items.map((candidate) =>
				candidate.id === itemId ? { ...candidate, packed } : candidate
			)
		},
		requests: [
			{
				path: `/api/gear/items/${itemId}/packing`,
				method: 'PATCH',
				body: { packed }
			}
		]
	};
}

export function markGearItemAvailable(data: GearPageData, itemId: string): GearMutation {
	const item = data.items.find((candidate) => candidate.id === itemId);
	if (!item) throw new Error('GEAR_ITEM_NOT_FOUND');
	const activeOwnerIds = new Set(
		data.people.filter((person) => person.activeTripMember).map((person) => person.id)
	);
	const ownerIds = item.ownerIds.filter((ownerId) => activeOwnerIds.has(ownerId));
	if (!ownerIds.length) throw new Error('GEAR_OWNER_REQUIRED');
	const body = {
		id: item.id,
		categoryId: item.categoryId,
		name: item.name,
		quantity: item.quantity,
		ownerIds,
		availability: 'available' as const,
		notes: item.notes,
		selected: true
	};
	return {
		next: {
			...data,
			items: data.items.map((candidate) =>
				candidate.id === item.id
					? {
							...candidate,
							ownerIds,
							availability: 'available',
							selected: true,
							needsOwnerResolution: false,
							retainedWithoutCurrentOwner: false
						}
					: candidate
			)
		},
		requests: [{ path: `/api/gear/items/${item.id}`, method: 'PUT', body }]
	};
}

export function resetGearPacking(data: GearPageData): GearMutation {
	const packedItems = data.items.filter((item) => item.selected && item.packed);
	return {
		next: {
			...data,
			items: data.items.map((item) => (item.packed ? { ...item, packed: false } : item))
		},
		requests: packedItems.map((item) => ({
			path: `/api/gear/items/${item.id}/packing`,
			method: 'PATCH',
			body: { packed: false }
		}))
	};
}

export function reorderGearCategories(
	data: GearPageData,
	categories: GearCategory[]
): GearMutation {
	return {
		next: { ...data, categories },
		requests: [
			{
				path: '/api/gear/categories',
				method: 'PATCH',
				body: { categoryIds: categories.map((category) => category.id) }
			}
		]
	};
}

export function retainGearItem(data: GearPageData, itemId: string): GearMutation {
	return {
		next: {
			...data,
			items: data.items.map((item) =>
				item.id === itemId
					? { ...item, needsOwnerResolution: false, retainedWithoutCurrentOwner: true }
					: item
			)
		},
		requests: [{ path: `/api/gear/items/${itemId}/retain`, method: 'POST' }]
	};
}
