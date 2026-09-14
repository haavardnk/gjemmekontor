import { afterEach, describe, expect, test, vi } from 'vitest';

import { GET } from '../../routes/api/trips/[tripId]/events/+server';
import { liveUpdates } from './live-updates';

vi.mock('$lib/server/env', () => ({
	getRuntimeConfig: () => ({ appVersion: 'v0.3.0' })
}));

const decoder = new TextDecoder();

async function openEvents(tripId: string): Promise<{
	abort: AbortController;
	reader: ReadableStreamDefaultReader<Uint8Array>;
	response: Response;
}> {
	const abort = new AbortController();
	const request = new Request(`http://localhost/api/trips/${tripId}/events`, {
		signal: abort.signal
	});
	const response = await GET({ params: { tripId }, request } as Parameters<typeof GET>[0]);
	if (!(response instanceof Response) || !response.body) throw new Error('EVENT_STREAM_REQUIRED');
	return { abort, reader: response.body.getReader(), response };
}

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
	const result = await reader.read();
	if (!result.value) throw new Error('EVENT_DATA_REQUIRED');
	return decoder.decode(result.value);
}

afterEach((): void => {
	vi.useRealTimers();
});

describe('trip events endpoint', (): void => {
	test('opens an unbuffered stream with current version', async (): Promise<void> => {
		const connection = await openEvents('trip-a');

		expect(connection.response.headers.get('content-type')).toBe('text/event-stream');
		expect(connection.response.headers.get('cache-control')).toBe('no-cache, no-transform');
		expect(connection.response.headers.get('x-accel-buffering')).toBe('no');
		expect(await readEvent(connection.reader)).toBe(
			'event: sync\ndata: {"state":true,"modules":[],"reload":false,"version":"v0.3.0"}\n\n'
		);

		connection.abort.abort();
		expect((await connection.reader.read()).done).toBe(true);
	});

	test('publishes only updates for the subscribed trip', async (): Promise<void> => {
		const tripA = await openEvents('trip-a');
		const tripB = await openEvents('trip-b');
		await readEvent(tripA.reader);
		await readEvent(tripB.reader);

		liveUpdates.publish('trip-a', { state: true, modules: [], reload: false });
		liveUpdates.publish('trip-b', { state: false, modules: ['menu'], reload: false });

		expect(await readEvent(tripA.reader)).toContain(
			'data: {"state":true,"modules":[],"reload":false}'
		);
		expect(await readEvent(tripB.reader)).toContain(
			'data: {"state":false,"modules":["menu"],"reload":false}'
		);

		tripA.abort.abort();
		tripB.abort.abort();
	});

	test('sends heartbeats and closes when the request aborts', async (): Promise<void> => {
		vi.useFakeTimers();
		const connection = await openEvents('trip-a');
		await readEvent(connection.reader);
		const heartbeat = readEvent(connection.reader);

		await vi.advanceTimersByTimeAsync(20_000);
		expect(await heartbeat).toBe(': heartbeat\n\n');

		connection.abort.abort();
		expect((await connection.reader.read()).done).toBe(true);
	});
});
