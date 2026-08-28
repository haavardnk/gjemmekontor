export type TripDay = {
	id: string;
	index: number;
	date: string;
	dateLabel: string;
	title: string;
	phase: string;
};

export function isTripDayIndex(value: unknown, dayCount: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < dayCount;
}

export function dateKeyAt(date: Date, timeZone: string): string {
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
	days: readonly TripDay[],
	timeZone: string
): number | undefined {
	const dateKey = dateKeyAt(date, timeZone);
	return days.find((day) => day.date === dateKey)?.index;
}
