export type TripDay = {
	index: number;
	date: string;
	dateLabel: string;
	title: string;
	phase: string;
	modules: string[];
	core: 'boat' | 'villa' | 'travel';
	flexible: boolean;
};

export const tripTimeZone = 'Europe/Zagreb';

const dayDefinitions = [
	[
		'2026-09-05',
		'Lørdag 5. september',
		'Reisedag, Bad Buoy og første avgang',
		'Båtdag 1',
		['overtakelse', 'avreise', 'mat'],
		'boat',
		false
	],
	[
		'2026-09-06',
		'Søndag 6. september',
		'Dag om bord',
		'Båtdag 2',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-07',
		'Mandag 7. september',
		'Dag om bord',
		'Båtdag 3',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-08',
		'Tirsdag 8. september',
		'Dag om bord',
		'Båtdag 4',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-09',
		'Onsdag 9. september',
		'Dag om bord',
		'Båtdag 5',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-10',
		'Torsdag 10. september',
		'Dag om bord',
		'Båtdag 6',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-11',
		'Fredag 11. september',
		'Dag om bord',
		'Båtdag 7',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-12',
		'Lørdag 12. september',
		'Dag om bord',
		'Båtdag 8',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-13',
		'Søndag 13. september',
		'Dag om bord',
		'Båtdag 9',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-14',
		'Mandag 14. september',
		'Dag om bord',
		'Båtdag 10',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-15',
		'Tirsdag 15. september',
		'Dag om bord',
		'Båtdag 11',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-16',
		'Onsdag 16. september',
		'Dag om bord',
		'Båtdag 12',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-17',
		'Torsdag 17. september',
		'Dag om bord',
		'Båtdag 13',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-18',
		'Fredag 18. september',
		'Siste hele dag om bord',
		'Båtdag 14',
		['dagstype', 'hovedscene', 'dagenssted'],
		'boat',
		true
	],
	[
		'2026-09-19',
		'Lørdag 19. september',
		'Siste seilas og videre til villaen',
		'Båt til villa',
		['avreise', 'levering', 'villa'],
		'boat',
		false
	],
	[
		'2026-09-20',
		'Søndag 20. september',
		'Første dag i villaen',
		'Villadag 1',
		['basseng', 'mat', 'ro'],
		'villa',
		false
	],
	[
		'2026-09-21',
		'Mandag 21. september',
		'En dag ved bassenget',
		'Villadag 2',
		['basseng', 'babyring', 'mat'],
		'villa',
		false
	],
	[
		'2026-09-22',
		'Tirsdag 22. september',
		'Siste hele feriedag',
		'Villadag 3',
		['basseng', 'mat', 'finale'],
		'villa',
		false
	],
	[
		'2026-09-23',
		'Onsdag 23. september',
		'Hjemreise',
		'Hjemreise',
		['pakking', 'hjemreise', 'finale'],
		'travel',
		false
	]
] as const;

export const tripDays: TripDay[] = dayDefinitions.map(
	([date, dateLabel, title, phase, modules, core, flexible], index) => ({
		index,
		date,
		dateLabel,
		title,
		phase,
		modules: [...modules],
		core,
		flexible
	})
);

export function isTripDayIndex(value: unknown): value is number {
	return (
		typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < tripDays.length
	);
}

export function dateKeyAt(date: Date): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: tripTimeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function tripDayIndexAt(date: Date): number | undefined {
	const dateKey = dateKeyAt(date);
	return tripDays.find((day) => day.date === dateKey)?.index;
}
