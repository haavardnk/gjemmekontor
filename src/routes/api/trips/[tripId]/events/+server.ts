import { getRuntimeConfig } from '$lib/server/env';
import { type LiveUpdate, liveUpdates } from '$lib/server/live-updates';

import type { RequestHandler } from './$types';

const heartbeatIntervalMs = 20_000;

function eventData(value: unknown): Uint8Array {
	return new TextEncoder().encode(`event: sync\ndata: ${JSON.stringify(value)}\n\n`);
}

export const GET: RequestHandler = ({ params, request }) => {
	const config = getRuntimeConfig();
	let close = (): void => undefined;
	const stream = new ReadableStream<Uint8Array>({
		start(controller): void {
			let closed = false;
			const send = (update: LiveUpdate): void => {
				if (!closed) controller.enqueue(eventData(update));
			};
			controller.enqueue(
				eventData({
					state: true,
					modules: [],
					reload: false,
					version: config.appVersion ?? null
				})
			);
			const unsubscribe = liveUpdates.subscribe(params.tripId, send);
			const heartbeat = setInterval(() => {
				if (!closed) controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
			}, heartbeatIntervalMs);
			close = (): void => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				unsubscribe();
				controller.close();
			};
			request.signal.addEventListener('abort', close, { once: true });
		},
		cancel(): void {
			close();
		}
	});
	return new Response(stream, {
		headers: {
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'content-type': 'text/event-stream',
			'x-accel-buffering': 'no'
		}
	});
};
