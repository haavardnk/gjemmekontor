import type { GearAvailability, GearCategory, GearItemView } from '../domain/gear';

export interface GearCategoryDraft {
	editing?: GearCategory;
	name: string;
}

export interface GearItemDraft {
	editing?: GearItemView;
	categoryId: string;
	name: string;
	quantity: number;
	ownerIds: string[];
	availability: GearAvailability;
	notes: string;
	planned: boolean;
}

export const emptyGearCategoryDraft = (): GearCategoryDraft => ({ name: '' });

export const emptyGearItemDraft = (): GearItemDraft => ({
	categoryId: '',
	name: '',
	quantity: 1,
	ownerIds: [],
	availability: 'available',
	notes: '',
	planned: true
});
