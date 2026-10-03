import type { PlanningReactionKind } from '../domain/planning';

export const planningReactionStyles: Record<
	PlanningReactionKind,
	{ emoji: string; label: string }
> = {
	love: { emoji: '❤️', label: 'Elsker' },
	like: { emoji: '👍', label: 'Bra' },
	unsure: { emoji: '🤔', label: 'Usikker' },
	dislike: { emoji: '👎', label: 'Nei takk' }
};
