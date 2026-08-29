import { describe, expect, test, vi } from 'vitest';

import { lookupFlightAwareFlights } from './flightaware';

describe('FlightAware lookup', (): void => {
	test('normalizes matching flights and prefers actual or estimated times', async (): Promise<void> => {
		let requestedUrl = '';
		let requestedHeaders: HeadersInit | undefined;
		const fetcher: typeof fetch = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
				requestedUrl = String(input);
				requestedHeaders = init?.headers;
				return Response.json({
					flights: [
						{
							fa_flight_id: 'SAS1461-1',
							ident: 'SAS1461',
							ident_iata: 'SK1461',
							operator: 'SAS',
							origin: {
								code: 'ENGM',
								code_iata: 'OSL',
								name: 'Oslo lufthavn',
								timezone: 'Europe/Oslo'
							},
							destination: {
								code: 'EKCH',
								code_iata: 'CPH',
								name: 'København',
								timezone: 'Europe/Copenhagen'
							},
							scheduled_out: '2026-09-05T06:00:00.000Z',
							scheduled_in: '2026-09-05T07:10:00.000Z',
							estimated_out: '2026-09-05T06:20:00.000Z',
							estimated_in: '2026-09-05T07:30:00.000Z',
							terminal_origin: '2',
							gate_origin: 'D4'
						}
					]
				});
			}
		);

		const candidates = await lookupFlightAwareFlights('secret', 'SK 1461', '2026-09-05', fetcher);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({
			providerFlightId: 'SAS1461-1',
			flightNumber: 'SK1461',
			status: 'delayed',
			from: {
				locationCode: 'OSL',
				localDateTime: '2026-09-05T08:20',
				terminal: '2',
				gate: 'D4'
			},
			to: { locationCode: 'CPH', localDateTime: '2026-09-05T09:30' }
		});
		expect(requestedUrl).toContain('/flights/SK1461');
		expect(requestedHeaders).toMatchObject({ 'x-apikey': 'secret' });
	});

	test('excludes provider results whose local departure date does not match', async (): Promise<void> => {
		const fetcher = vi.fn(async (): Promise<Response> =>
			Response.json({
				flights: [
					{
						fa_flight_id: 'old',
						origin: { name: 'Oslo', timezone: 'Europe/Oslo' },
						destination: { name: 'København', timezone: 'Europe/Copenhagen' },
						scheduled_out: '2026-09-04T06:00:00.000Z',
						scheduled_in: '2026-09-04T07:00:00.000Z'
					}
				]
			})
		);

		expect(await lookupFlightAwareFlights('secret', 'SK1461', '2026-09-05', fetcher)).toEqual([]);
	});

	test('uses published schedules and airport timezones beyond the live two-day window', async (): Promise<void> => {
		const requestedUrls: string[] = [];
		const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.includes('/flights/SK1461')) {
				return Response.json(
					{
						reason: 'INVALID_ARGUMENT',
						detail: 'Invalid start bound: time is too far in the future (limit: 2 days)'
					},
					{ status: 400 }
				);
			}
			if (url.includes('/schedules/2026-09-05/2026-09-06')) {
				return Response.json({
					scheduled: [
						{
							ident: 'SAS1461',
							ident_icao: 'SAS1461',
							ident_iata: 'SK1461',
							origin: 'ENGM',
							origin_icao: 'ENGM',
							origin_iata: 'OSL',
							destination: 'EKCH',
							destination_icao: 'EKCH',
							destination_iata: 'CPH',
							scheduled_out: '2026-09-05T04:00:00Z',
							scheduled_in: '2026-09-05T05:15:00Z',
							fa_flight_id: null
						},
						{
							ident: 'DAL7654',
							ident_iata: 'DL7654',
							actual_ident: 'SAS1461',
							actual_ident_iata: 'SK1461',
							origin: 'ENGM',
							destination: 'EKCH',
							scheduled_out: '2026-09-05T04:00:00Z',
							scheduled_in: '2026-09-05T05:15:00Z'
						}
					]
				});
			}
			if (url.endsWith('/airports/ENGM')) {
				return Response.json({
					airport_code: 'ENGM',
					code_icao: 'ENGM',
					code_iata: 'OSL',
					name: 'Oslo, Gardermoen',
					timezone: 'Europe/Oslo'
				});
			}
			if (url.endsWith('/airports/EKCH')) {
				return Response.json({
					airport_code: 'EKCH',
					code_icao: 'EKCH',
					code_iata: 'CPH',
					name: 'Copenhagen',
					timezone: 'Europe/Copenhagen'
				});
			}
			return Response.json({}, { status: 404 });
		});

		const candidates = await lookupFlightAwareFlights('secret', 'SK1461', '2026-09-05', fetcher);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({
			providerFlightId: 'schedule:SAS1461:2026-09-05T04:00:00Z',
			flightNumber: 'SK1461',
			status: 'planned',
			from: {
				locationName: 'Oslo, Gardermoen',
				locationCode: 'OSL',
				localDateTime: '2026-09-05T06:00',
				timeZone: 'Europe/Oslo'
			},
			to: {
				locationName: 'Copenhagen',
				locationCode: 'CPH',
				localDateTime: '2026-09-05T07:15',
				timeZone: 'Europe/Copenhagen'
			}
		});
		expect(requestedUrls.some((url) => url.includes('airline=SK'))).toBe(true);
		expect(requestedUrls.some((url) => url.includes('flight_number=1461'))).toBe(true);
	});

	test('fails closed on an invalid provider response', async (): Promise<void> => {
		const fetcher = vi.fn(async (): Promise<Response> => Response.json({ flights: 'invalid' }));

		await expect(
			lookupFlightAwareFlights('secret', 'SK1461', '2026-09-05', fetcher)
		).rejects.toThrow('INVALID_FLIGHTAWARE_RESPONSE');
	});
});
