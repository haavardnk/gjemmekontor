import type { TripDay } from '$lib/trip/itinerary';

export type ShotsDayPlan = {
	modules: string[];
	core: 'boat' | 'villa' | 'travel';
	flexible: boolean;
};

export type ShotsDay = TripDay & ShotsDayPlan;

const fixedModules: Record<number, string[]> = {
	0: ['utreise', 'overtakelse', 'avreise'],
	14: ['avreise', 'levering', 'villa'],
	17: ['finale'],
	18: ['hjemreise']
};

export function shotsDayPlan(dayIndex: number): ShotsDayPlan {
	return {
		modules: [...(fixedModules[dayIndex] ?? [])],
		core: dayIndex === 0 || dayIndex === 18 ? 'travel' : dayIndex >= 15 ? 'villa' : 'boat',
		flexible: dayIndex >= 1 && dayIndex <= 13
	};
}

export function withShotsDayPlan(day: TripDay): ShotsDay {
	return { ...day, ...shotsDayPlan(day.index) };
}
