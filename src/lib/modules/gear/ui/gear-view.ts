import type { GearCategory, GearItemView } from '../domain/gear';

interface GearItemGroupBase {
	id: string;
	name: string;
	items: GearItemView[];
	allItems: GearItemView[];
}

export type GearItemGroup = GearItemGroupBase &
	({ kind: 'category'; category: GearCategory } | { kind: 'person'; ownerId: string });
