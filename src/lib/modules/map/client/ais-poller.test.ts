import { afterEach, describe, expect, test, vi } from 'vitest';

import { parseAisResponse, startAisPolling } from './ais-poller';

afterEach(() => vi.useRealTimers());

describe('AIS poller', (): void => {
	test('validates feature collection responses', (): void => {
		const response = { type: 'FeatureCollection', features: [], status: 'connected' };
		expect(parseAisResponse(response)).toBe(response);
		expect(() => parseAisResponse({ features: [], status: 'connected' })).toThrow(
			'AIS_INVALID_RESPONSE'
		);
	});

	test('polls immediately and on schedule without overlapping requests', async (): Promise<void> => {
		vi.useFakeTimers();
		let resolveRequest: ((value: unknown) => void) | undefined;
		const request = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveRequest = resolve;
				})
		);
		const onData = vi.fn();
		const stop = startAisPolling({
			onData,
			onError: vi.fn(),
			request,
			intervalMs: 100
		});
		expect(request).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(200);
		expect(request).toHaveBeenCalledTimes(1);
		resolveRequest?.({ type: 'FeatureCollection', features: [], status: 'connected' });
		await vi.runAllTicks();
		expect(onData).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(100);
		expect(request).toHaveBeenCalledTimes(2);
		stop();
	});

	test('reports invalid responses and stops updates after disposal', async (): Promise<void> => {
		const onData = vi.fn();
		const onError = vi.fn();
		const stop = startAisPolling({
			onData,
			onError,
			request: vi.fn().mockResolvedValue({ invalid: true }),
			intervalMs: 60_000
		});
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		stop();
		expect(onData).not.toHaveBeenCalled();
	});
});
