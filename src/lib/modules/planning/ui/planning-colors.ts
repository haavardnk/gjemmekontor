import type { PlanningCategoryColor } from '../domain/planning';

export const planningColorStyles: Record<
	PlanningCategoryColor,
	{ label: string; swatch: string; accent: string }
> = {
	sky: { label: 'Blå', swatch: 'bg-sky-500', accent: 'border-l-sky-500' },
	emerald: { label: 'Grønn', swatch: 'bg-emerald-500', accent: 'border-l-emerald-500' },
	amber: { label: 'Gul', swatch: 'bg-amber-400', accent: 'border-l-amber-400' },
	rose: { label: 'Rød', swatch: 'bg-rose-500', accent: 'border-l-rose-500' },
	violet: { label: 'Lilla', swatch: 'bg-violet-500', accent: 'border-l-violet-500' },
	slate: { label: 'Grå', swatch: 'bg-slate-500', accent: 'border-l-slate-500' }
};

export const unsortedAccent = 'border-l-base-300';
