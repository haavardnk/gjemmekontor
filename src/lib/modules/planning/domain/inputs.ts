import { z } from 'zod';

import { planningCategoryColors, planningLimits } from './planning';

const uniqueIds = (items: readonly { id: string }[]): boolean =>
	new Set(items.map((item) => item.id)).size === items.length;

export const planningCategoryInputSchema = z
	.object({
		name: z.string().trim().min(1).max(planningLimits.categoryName),
		color: z.enum(planningCategoryColors)
	})
	.strict();

export const planningCategoryCreateInputSchema = planningCategoryInputSchema
	.extend({ id: z.uuid() })
	.strict();

export const planningCategoryPlacementInputSchema = z
	.object({ index: z.number().int().min(0) })
	.strict();

export const planningCardPlacementInputSchema = z
	.object({ categoryId: z.uuid().nullable(), index: z.number().int().min(0) })
	.strict();

export const planningPlaceInputSchema = z
	.object({
		label: z.string().trim().min(1).max(planningLimits.placeLabel),
		lat: z.number().min(-90).max(90).nullable(),
		lng: z.number().min(-180).max(180).nullable(),
		googlePlaceId: z.string().trim().min(1).max(300).nullable()
	})
	.strict()
	.refine((place) => (place.lat === null) === (place.lng === null));

export const planningChecklistItemInputSchema = z
	.object({
		id: z.uuid(),
		text: z.string().trim().min(1).max(planningLimits.checklistText),
		checked: z.boolean()
	})
	.strict();

export const planningLinkInputSchema = z
	.object({
		id: z.uuid(),
		url: z.url({ protocol: /^https?$/, normalize: true }).max(planningLimits.url)
	})
	.strict();

export const planningCardInputSchema = z
	.object({
		personId: z.uuid(),
		categoryId: z.uuid().nullable(),
		title: z.string().trim().min(1).max(planningLimits.title),
		body: z.string().trim().max(planningLimits.body),
		place: planningPlaceInputSchema.nullable(),
		checklist: z
			.array(planningChecklistItemInputSchema)
			.max(planningLimits.checklistItems)
			.refine(uniqueIds),
		links: z.array(planningLinkInputSchema).max(planningLimits.links).refine(uniqueIds)
	})
	.strict();

export const planningCardCreateInputSchema = planningCardInputSchema
	.extend({ id: z.uuid() })
	.strict();

export const planningChecklistToggleInputSchema = z
	.object({ personId: z.uuid(), checked: z.boolean() })
	.strict();

export type PlanningCategoryInput = z.infer<typeof planningCategoryInputSchema>;
export type PlanningCardInput = z.infer<typeof planningCardInputSchema>;
export type PlanningCardDraft = z.input<typeof planningCardInputSchema>;
