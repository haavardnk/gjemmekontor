export function requireTrip(locals: App.Locals): NonNullable<App.Locals['trip']> {
	if (!locals.trip) throw new Error('TRIP_REQUIRED');
	return locals.trip;
}
