import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';
import type WebSocket from 'ws';

import { applyAisMessage, createAisService, vesselFeatures } from './ais';

class FakeSocket extends EventEmitter {
	readonly sent: string[] = [];
	closed = false;
	terminated = false;
	pings = 0;

	send(value: string): void {
		this.sent.push(value);
	}

	close(): void {
		this.closed = true;
	}

	terminate(): void {
		this.terminated = true;
	}

	ping(): void {
		this.pings += 1;
	}
}

afterEach((): void => {
	vi.useRealTimers();
});

function envelope(messageType: string, body: Record<string, unknown>, metadata = {}): unknown {
	return {
		MessageType: messageType,
		MetaData: { MMSI: 257069200, ShipName: ' KV FARM@@@ ', ...metadata },
		Message: { [messageType]: { UserID: 257069200, Valid: true, ...body } }
	};
}

describe('AIS vessel state', (): void => {
	test('merges static data with a later position and normalizes direction and dimensions', (): void => {
		const vessels = new Map();
		expect(
			applyAisMessage(
				vessels,
				envelope('ShipStaticData', {
					CallSign: 'LBHF@@',
					Destination: 'TESTPORT@@',
					Dimension: { A: 20, B: 27, C: 7, D: 7 },
					ImoNumber: 9353333,
					MaximumStaticDraught: 4.5,
					Name: 'KV FARM@@',
					Type: 55
				}),
				1_000
			)
		).toBe(true);
		expect(
			applyAisMessage(
				vessels,
				envelope('PositionReport', {
					Cog: 86.7,
					Latitude: 43.25,
					Longitude: 16.25,
					NavigationalStatus: 0,
					Sog: 12.4,
					TrueHeading: 511
				}),
				2_000
			)
		).toBe(true);

		expect(vesselFeatures(vessels, 2_000, 60_000)).toEqual([
			expect.objectContaining({
				id: 'ais-257069200',
				geometry: { type: 'Point', coordinates: [16.25, 43.25] },
				properties: expect.objectContaining({
					callSign: 'LBHF',
					destination: 'TESTPORT',
					direction: 86.7,
					lengthMeters: 47,
					name: 'KV FARM',
					widthMeters: 14
				})
			})
		]);
	});

	test('accepts Class B positions and evicts stale vessels', (): void => {
		const vessels = new Map();
		applyAisMessage(
			vessels,
			envelope('StandardClassBPositionReport', {
				Cog: 181,
				Latitude: 43.1,
				Longitude: 16.4,
				Sog: 5.2,
				TrueHeading: 180
			}),
			10_000
		);
		expect(vesselFeatures(vessels, 10_500, 1_000)).toHaveLength(1);
		expect(vesselFeatures(vessels, 11_001, 1_000)).toEqual([]);
		expect(vessels.size).toBe(0);
	});

	test('ignores invalid coordinates', (): void => {
		const vessels = new Map();
		applyAisMessage(vessels, envelope('PositionReport', { Latitude: 91, Longitude: 181 }), 1_000);
		expect(vesselFeatures(vessels, 1_000, 60_000)).toEqual([]);
	});
});

describe('AIS stream service', (): void => {
	test('subscribes with the map bounds converted to AIS latitude/longitude order', async (): Promise<void> => {
		const socket = new FakeSocket();
		const service = createAisService({
			apiKey: 'secret-key',
			getBounds: async () => [15.7, 42.7, 17, 43.7],
			createSocket: () => socket as unknown as WebSocket,
			now: () => 1_000,
			random: () => 0
		});

		expect(service.getSnapshot().status).toBe('connecting');
		await Promise.resolve();
		socket.emit('open');
		expect(socket.sent).toHaveLength(1);
		expect(JSON.parse(socket.sent[0] as string)).toMatchObject({
			APIKey: 'secret-key',
			BoundingBoxes: [
				[
					[42.7, 15.7],
					[43.7, 17]
				]
			],
			FilterMessageTypes: [
				'PositionReport',
				'StandardClassBPositionReport',
				'ExtendedClassBPositionReport',
				'LongRangeAisBroadcastMessage',
				'ShipStaticData',
				'StaticDataReport'
			]
		});

		socket.emit(
			'message',
			Buffer.from(
				JSON.stringify({
					MessageType: 'SubscriptionConfirmation',
					Message: { SubscriptionConfirmation: { CompressionEnabled: true } }
				})
			)
		);
		expect(service.getSnapshot().status).toBe('connected');
		service.stop();
		expect(socket.closed).toBe(true);
	});

	test('terminates an upstream error and reconnects with backoff', async (): Promise<void> => {
		vi.useFakeTimers();
		const firstSocket = new FakeSocket();
		const secondSocket = new FakeSocket();
		const sockets = [firstSocket, secondSocket];
		const service = createAisService({
			apiKey: 'secret-key',
			getBounds: async () => [15.7, 42.7, 17, 43.7],
			createSocket: () => sockets.shift() as unknown as WebSocket,
			now: () => 1_000,
			random: () => 0
		});

		service.getSnapshot();
		await Promise.resolve();
		firstSocket.emit('open');
		firstSocket.emit('message', Buffer.from(JSON.stringify({ error: 'connection limit' })));

		expect(firstSocket.terminated).toBe(true);
		expect(service.getSnapshot()).toMatchObject({
			status: 'reconnecting',
			error: 'AISSTREAM_UPSTREAM_ERROR'
		});

		await vi.advanceTimersByTimeAsync(1_000);
		secondSocket.emit('open');
		expect(secondSocket.sent).toHaveLength(1);
		service.stop();
	});

	test('reconnects when a confirmed stream stops delivering AIS messages', async (): Promise<void> => {
		vi.useFakeTimers();
		const socket = new FakeSocket();
		const service = createAisService({
			apiKey: 'secret-key',
			getBounds: async () => [15.7, 42.7, 17, 43.7],
			createSocket: () => socket as unknown as WebSocket,
			heartbeatMs: 60_000,
			now: () => 1_000,
			random: () => 0,
			silenceAfterMs: 5_000
		});

		service.getSnapshot();
		await Promise.resolve();
		socket.emit('open');
		socket.emit(
			'message',
			Buffer.from(
				JSON.stringify({
					MessageType: 'SubscriptionConfirmation',
					Message: { CompressionEnabled: true }
				})
			)
		);

		await vi.advanceTimersByTimeAsync(5_000);
		expect(socket.terminated).toBe(true);
		expect(service.getSnapshot()).toMatchObject({
			status: 'reconnecting',
			error: 'AISSTREAM_STREAM_STALLED'
		});
		service.stop();
	});

	test('restores cached vessels across restarts and retains them for 24 hours', async (): Promise<void> => {
		const directory = mkdtempSync(join(tmpdir(), 'gjemmekontor-ais-'));
		const cachePath = join(directory, 'vessels.json');
		let clock = 1_000;
		try {
			const firstSocket = new FakeSocket();
			const firstService = createAisService({
				apiKey: 'secret-key',
				cachePath,
				createSocket: () => firstSocket as unknown as WebSocket,
				getBounds: async () => [15.7, 42.7, 17, 43.7],
				now: () => clock
			});
			firstService.getSnapshot();
			await Promise.resolve();
			firstSocket.emit('open');
			firstSocket.emit(
				'message',
				Buffer.from(
					JSON.stringify(
						envelope('StandardClassBPositionReport', {
							Cog: 181,
							Latitude: 43.1,
							Longitude: 16.4,
							Sog: 5.2,
							TrueHeading: 180
						})
					)
				)
			);
			firstService.stop();

			clock += 23 * 60 * 60 * 1_000;
			const secondService = createAisService({
				apiKey: 'secret-key',
				cachePath,
				createSocket: () => new FakeSocket() as unknown as WebSocket,
				getBounds: async () => [15.7, 42.7, 17, 43.7],
				now: () => clock
			});
			expect(secondService.getSnapshot().features).toHaveLength(1);
			clock += 60 * 60 * 1_000 + 1;
			expect(secondService.getSnapshot().features).toEqual([]);
			secondService.stop();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
