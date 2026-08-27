export type TripDay = {
	index: number;
	date: string;
	dateLabel: string;
	title: string;
	phase: string;
};

export const tripTimeZone = 'Europe/Zagreb';

const dayDefinitions = [
	[
		'2026-09-05',
		'Lørdag 5. september',
		'Reisedag, Bad Buoy og første avgang',
		'Reisedag · Båtdag 1'
	],
	['2026-09-06', 'Søndag 6. september', 'Dag om bord', 'Båtdag 2'],
	['2026-09-07', 'Mandag 7. september', 'Dag om bord', 'Båtdag 3'],
	['2026-09-08', 'Tirsdag 8. september', 'Dag om bord', 'Båtdag 4'],
	['2026-09-09', 'Onsdag 9. september', 'Dag om bord', 'Båtdag 5'],
	['2026-09-10', 'Torsdag 10. september', 'Dag om bord', 'Båtdag 6'],
	['2026-09-11', 'Fredag 11. september', 'Dag om bord', 'Båtdag 7'],
	['2026-09-12', 'Lørdag 12. september', 'Dag om bord', 'Båtdag 8'],
	['2026-09-13', 'Søndag 13. september', 'Dag om bord', 'Båtdag 9'],
	['2026-09-14', 'Mandag 14. september', 'Dag om bord', 'Båtdag 10'],
	['2026-09-15', 'Tirsdag 15. september', 'Dag om bord', 'Båtdag 11'],
	['2026-09-16', 'Onsdag 16. september', 'Dag om bord', 'Båtdag 12'],
	['2026-09-17', 'Torsdag 17. september', 'Dag om bord', 'Båtdag 13'],
	['2026-09-18', 'Fredag 18. september', 'Siste hele dag om bord', 'Båtdag 14'],
	['2026-09-19', 'Lørdag 19. september', 'Siste seilas og videre til villaen', 'Båt til villa'],
	['2026-09-20', 'Søndag 20. september', 'Første dag i villaen', 'Villadag 1'],
	['2026-09-21', 'Mandag 21. september', 'En dag ved bassenget', 'Villadag 2'],
	['2026-09-22', 'Tirsdag 22. september', 'Siste hele feriedag', 'Villadag 3'],
	['2026-09-23', 'Onsdag 23. september', 'Hjemreise', 'Hjemreise']
] as const;

export const tripDays: TripDay[] = dayDefinitions.map(([date, dateLabel, title, phase], index) => ({
	index,
	date,
	dateLabel,
	title,
	phase
}));

export function isTripDayIndex(value: unknown, dayCount = tripDays.length): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < dayCount;
}

export function dateKeyAt(date: Date, timeZone = tripTimeZone): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function tripDayIndexAt(
	date: Date,
	days: readonly TripDay[] = tripDays,
	timeZone = tripTimeZone
): number | undefined {
	const dateKey = dateKeyAt(date, timeZone);
	return days.find((day) => day.date === dateKey)?.index;
}
